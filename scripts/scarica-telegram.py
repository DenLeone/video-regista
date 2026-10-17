#!/usr/bin/env python3
# Scarica i file che Denis ha mandato al bot su Telegram.
# La Bot API normale fa scaricare ai bot solo file fino a 20 MB; qui ci si collega
# come lo stesso bot ma via MTProto (Telethon), che arriva a 2 GB per file.
#
# Uso: python3 scarica-telegram.py <cartella di destinazione>
# Ambiente: TELEGRAM_FILE = [{"m": id_messaggio, "n": "nome.mov"}, ...]
#           TG_API_ID, TG_API_HASH (my.telegram.org), TELEGRAM_BOT_TOKEN

import asyncio
import json
import os
import sys
import time

from telethon import TelegramClient
from telethon.sessions import StringSession


async def main():
    refs = json.loads(os.environ['TELEGRAM_FILE'])
    dest = sys.argv[1]
    os.makedirs(dest, exist_ok=True)
    client = TelegramClient(StringSession(), int(os.environ['TG_API_ID']), os.environ['TG_API_HASH'])
    await client.start(bot_token=os.environ['TELEGRAM_BOT_TOKEN'])
    limite = asyncio.Semaphore(3)  # tre file alla volta
    usati = set()

    async def uno(r):
        async with limite:
            # chat privata col bot: basta il numero del messaggio
            msg = await client.get_messages(None, ids=int(r['m']))
            if not msg or not msg.file:
                raise RuntimeError(f"messaggio {r['m']}: nessun file (cancellato?)")
            nome = os.path.basename(r.get('n') or msg.file.name or f"telegram_{r['m']}{msg.file.ext or ''}")
            base, ext = os.path.splitext(nome)
            k = 2
            while nome.lower() in usati:
                nome = f'{base}_{k}{ext}'
                k += 1
            usati.add(nome.lower())
            t0 = time.time()
            percorso = await client.download_media(msg, file=os.path.join(dest, nome))
            mb = os.path.getsize(percorso) / 1e6
            print(f'[telegram] {nome}: {mb:.0f} MB in {time.time() - t0:.0f} s', flush=True)

    try:
        await asyncio.gather(*(uno(r) for r in refs))
    finally:
        await client.disconnect()


asyncio.run(main())
