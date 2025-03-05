const PastebinAPI = require('pastebin-js');
const pastebin = new PastebinAPI('yPhyFU5ntx3DNNmXSRUDPZG1bSHoRoAa');
const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

let router = express.Router();

// Function to remove files or directories
function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}


function cleanup() {
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach((file) => {
            removeFile(path.join(tempDir, file));
        });
    }
}


process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    let retryCount = 0;
    const maxRetries = 3;

    async function getPaire() {
        if (retryCount >= maxRetries) {
            console.log('Max retry limit reached');
            if (!res.headersSent) res.send({ error: 'Max retries reached' });
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'temp', id));

        try {
            let session = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
                browser: Browsers.macOS('Safari'),
            });

            if (!session.authState.creds.registered) {
                await delay(1500);
                if (!num) throw new Error('Invalid phone number');
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await session.requestPairingCode(num);
                    if (!res.headersSent) {
                        res.send({ code });
                    }
                } catch (error) {
                    console.error('Pairing request failed:', error.message);
                    if (!res.headersSent) res.send({ error: 'Pairing failed' });
                    return;
                }
            }

            session.ev.on('creds.update', saveCreds);
            session.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    await delay(10000);

                    let link = await pastebin.createPasteFromFile(
                        path.join(__dirname, 'temp', id, 'creds.json'),
                        'IRIS Session',
                        null,
                        1,
                        'N'
                    );
                    let data = link.replace('https://pastebin.com/', '');
                    let code = Buffer.from(data).toString('base64');
                    let words = code.split('');
                    let ress = words[Math.floor(words.length / 2)];
                    let c = code.split(ress).join(ress + '_IRIS_');

                    await session.sendMessage(session.user.id, { text: `${c}` });
                   

                    await delay(100);
                    await session.ws.close();
                    return removeFile(path.join(__dirname, 'temp', id));
                } else if (
                    connection === 'close' &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output.statusCode !== 401
                ) {
                    retryCount++;
                    console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
                    await delay(10000);
                    getPaire();
                }
            });
        } catch (err) {
            console.log('Service restarted:', err.message);
            removeFile(path.join(__dirname, 'temp', id));
            if (!res.headersSent) res.send({ error: 'Service Unavailable' });
        }
    }

    return getPaire();
});

module.exports = router;
