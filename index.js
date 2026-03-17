const { Telegraf, Markup } = require('telegraf');
const { TOKEN } = require('./config');

const bot = new Telegraf(TOKEN);

// Fungsi Start dengan Tampilan Mewah
bot.command('start', (ctx) => {
    const message = 
        `🎰 *SELAMAT DATANG DI CASINO BOT* 🎰\n\n` +
        `Halo *${ctx.from.first_name}*! Siapkan keberuntunganmu.\n\n` +
        `📝 *INFO GAME:*\n` +
        `• 💎💎💎 : *JACKPOT!* (Selamat anda beruntung)\n` +
        `• 💎💎🏼 : *HAMPIR!* (Sebentar lagi kamu dapat ayo semangat)\n` +
        `• 🍎🍌🍇 : *ZONK!* (Yah kamu tidak beruntung)\n\n` +
        `Klik tombol di bawah untuk memutar mesin slot! 👇`;

    ctx.replyWithMarkdownV2(message.replace(/\!/g, '\\!').replace(/\./g, '\\.'), 
        Markup.inlineKeyboard([
            [Markup.button.callback('🎰 MULAI SPIN', 'spin')]
        ])
    );
});

// Logika Spin & Deteksi Gambar
bot.action('spin', async (ctx) => {
    try {
        await ctx.answerCbQuery('Spinning... 🎰');
        
        // Kirim Slot Machine
        const diceMsg = await ctx.replyWithDice({ emoji: '🎰' });
        const val = diceMsg.dice.value;

        /* Rumus Slot Telegram (0-63):
           Nilai dikurangi 1 agar base 0.
           Posisi Kiri (a), Tengah (b), Kanan (c)
        */
        const v = val - 1;
        const a = v % 4;          // Gambar 1
        const b = Math.floor(v / 4) % 4; // Gambar 2
        const c = Math.floor(v / 16);    // Gambar 3

        // Delay 4 detik agar sinkron dengan animasi
        setTimeout(async () => {
            let resultText = "";

            if (a === b && b === c) {
                // TIGA GAMBAR SAMA
                resultText = `🎉 *JACKPOT 777* 🎉\n\n✅ Selamat anda beruntung! Kombinasi sempurna! 💰`;
            } else if (a === b || b === c || a === c) {
                // DUA GAMBAR SAMA
                resultText = `🎰 *HAMPIR JACKPOT*\n\n🔥 Sebentar lagi kamu dapat ayo semangat! Coba sekali lagi!`;
            } else {
                // BEDA SEMUA (GAGAL)
                resultText = `🎰 *FREE SPIN RESULT*\n\n❌ Yah kamu tidak beruntung. Ayo putar lagi!`;
            }

            await ctx.replyWithMarkdown(resultText, 
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 SPIN LAGI', 'spin')]
                ])
            );
        }, 4000);

    } catch (e) {
        console.error("Error:", e);
    }
});

bot.launch().then(() => console.log('✅ Bot Berhasil Jalan! Ketik /start di Telegram.'));

// Anti-Error saat bot dimatikan
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
