const { Telegraf, Markup } = require('telegraf');
const { TOKEN } = require('./config');

const bot = new Telegraf(TOKEN);

// Fungsi Start - Menggunakan HTML mode agar tidak error karakter khusus
bot.command('start', (ctx) => {
    const user = ctx.from.first_name || "Player";
    const message = 
        `🎰 <b>SELAMAT DATANG DI CASINO BOT</b> 🎰\n\n` +
        `Halo <b>${user}</b>! Siapkan keberuntunganmu.\n\n` +
        `📝 <b>INFO GAME:</b>\n` +
        `• 💎💎💎 : <b>JACKPOT!</b> (Selamat anda beruntung)\n` +
        `• 💎💎🏼 : <b>HAMPIR!</b> (Sebentar lagi kamu dapat ayo semangat)\n` +
        `• 🍎🍌🍇 : <b>ZONK!</b> (Yah kamu tidak beruntung)\n\n` +
        `Klik tombol di bawah untuk memutar mesin slot! 👇`;

    ctx.replyWithHTML(message, 
        Markup.inlineKeyboard([
            [Markup.button.callback('🎰 MULAI SPIN', 'spin')]
        ])
    );
});

// Logika Spin & Deteksi Gambar
bot.action('spin', async (ctx) => {
    try {
        // Hapus loading state pada tombol
        await ctx.answerCbQuery('Spinning... 🎰');
        
        // Kirim Slot Machine (Dice)
        const diceMsg = await ctx.replyWithDice({ emoji: '🎰' });
        const val = diceMsg.dice.value;

        /* Logika Matematika Slot Telegram:
           Value 1-64. Kita pecah jadi 3 posisi (a, b, c)
        */
        const v = val - 1;
        const a = v % 4;                  // Posisi Kiri
        const b = Math.floor(v / 4) % 4;  // Posisi Tengah
        const c = Math.floor(v / 16);     // Posisi Kanan

        // Jeda 4 detik (menunggu animasi slot berhenti)
        setTimeout(async () => {
            let resultText = "";

            // 1. Cek jika 3 gambar sama (JACKPOT)
            if (a === b && b === c) {
                resultText = `🎉 <b>JACKPOT 777!</b> 🎉\n\n✅ Selamat anda beruntung! Kombinasi sempurna! 💰`;
            } 
            // 2. Cek jika hanya 2 gambar yang sama (HAMPIR)
            else if (a === b || b === c || a === c) {
                resultText = `🎰 <b>HAMPIR JACKPOT!</b>\n\n🔥 Sebentar lagi kamu dapat ayo semangat! Coba sekali lagi!`;
            } 
            // 3. Jika tidak ada yang sama (GAGAL)
            else {
                resultText = `🎰 <b>FREE SPIN RESULT</b>\n\n❌ Yah kamu tidak beruntung. Ayo putar lagi!`;
            }

            // Kirim hasil dengan tombol main lagi
            await ctx.replyWithHTML(resultText, 
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 SPIN LAGI', 'spin')]
                ])
            );
        }, 4000);

    } catch (e) {
        console.error("Error detected:", e.message);
    }
});

// Menjalankan Bot
bot.launch()
    .then(() => console.log('✅ Bot Berhasil Jalan! Silahkan tes di Telegram.'))
    .catch((err) => console.error('Gagal start bot:', err));

// Penanganan penghentian bot secara aman
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
