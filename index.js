const { Telegraf, Markup, session } = require('telegraf');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fetch = require('node-fetch');
const QRCode = require('qrcode');
const randomString = require('string-random');
const mongoose = require('mongoose');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const CONFIG = {
    BOT_TOKEN: '8480950575:AAGzX8EsPu5Nyuph-1ECzLSGkCaOXXQR5KY',
    ADMIN_ID: 6816905895,
    API_KEY_ATLANTIC: 'cIr6yFSfNiCtzfOw50IIb8xvviGlG4U9o7wLe60Pvrz9os0Ff0ARoAMKdNj7YyqVYi25YtfQoyGVlPo8ce3wAuawklZJlqJF6mmN',
    BASE_URL_ATLANTIC: 'https://atlantich2h.com',
    API_ID: 31639742,
    API_HASH: '7c24cdee5f2b98ad27b0b8f0a07e566a',
    MAIN_IMG: 'https://foto-to-url.gt.tc/uploads/img_698dec1092ab74.42210595.png',
    CHANNELS: [
        '@xStoreNoktel',
        '@StoreRealll'
    ],
    MONGODB_URI: 'mongodb+srv://cmurah60_db_user:6RHof8abbe5nQeij@ajayajay.i7lyfmk.mongodb.net/?appName=ajayajay'
};

const BOT_START_TIME = Date.now();

const bot = new Telegraf(CONFIG.BOT_TOKEN);
bot.use(session());

// ==========================================
// 🗄️ MONGOOSE SCHEMAS
// ==========================================

// Schema untuk Session Akun (Stok)
const AccountSchema = new mongoose.Schema({
    category: { type: Number, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    tgId: { type: String, required: true },
    price: { type: Number, required: true },
    session: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Schema untuk User
const UserSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    username: { type: String, default: null },
    balance: { type: Number, default: 0 },
    orders: [{
        id: String,
        category: String,
        accountName: String,
        phone: String,
        price: Number,
        status: String,
        timestamp: { type: Date, default: Date.now }
    }],
    deposits: [{
        id: String,
        nominal: Number,
        method: String,
        status: String,
        timestamp: { type: Date, default: Date.now }
    }],
    role: { type: String, default: 'Member' },
    createdAt: { type: Date, default: Date.now }
});

// Schema untuk Deposit
const DepositSchema = new mongoose.Schema({
    depositId: { type: String, required: true, unique: true },
    userId: { type: Number, required: true },
    chatId: { type: Number, required: true },
    msgId: { type: Number, required: true },
    status: { type: String, default: 'pending' },
    nominal: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Schema untuk Settings (Harga, Promo, Maintenance)
const SettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const Account = mongoose.model('Account', AccountSchema);
const User = mongoose.model('User', UserSchema);
const Deposit = mongoose.model('Deposit', DepositSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ==========================================
// 🗄️ DATABASE FUNCTIONS
// ==========================================

async function connectDB() {
    try {
        await mongoose.connect(CONFIG.MONGODB_URI);
        console.log('✅ MongoDB Connected');
        
        // Initialize default prices if not exists
        for (let i = 1; i <= 8; i++) {
            const existing = await Settings.findOne({ key: `price_${i}` });
            if (!existing) {
                await Settings.create({ key: `price_${i}`, value: 15000 });
            }
        }
        
        // Initialize maintenance status if not exists
        const maint = await Settings.findOne({ key: 'maintenance' });
        if (!maint) {
            await Settings.create({ key: 'maintenance', value: false });
        }
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    }
}

// Helper functions untuk database
async function getPrice(category) {
    const setting = await Settings.findOne({ key: `price_${category}` });
    return setting ? setting.value : 15000;
}

async function setPrice(category, price) {
    await Settings.findOneAndUpdate(
        { key: `price_${category}` },
        { value: price },
        { upsert: true }
    );
}

async function getPromo(category) {
    const setting = await Settings.findOne({ key: `promo_${category}` });
    return setting ? setting.value : null;
}

async function setPromo(category, price) {
    await Settings.findOneAndUpdate(
        { key: `promo_${category}` },
        { value: price },
        { upsert: true }
    );
}

async function getMaintenance() {
    const setting = await Settings.findOne({ key: 'maintenance' });
    return setting ? setting.value : false;
}

async function setMaintenance(status) {
    await Settings.findOneAndUpdate(
        { key: 'maintenance' },
        { value: status },
        { upsert: true }
    );
}

async function getStocks(category) {
    return await Account.find({ category });
}

async function getAllStocks() {
    const stocks = await Account.find();
    const grouped = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
    stocks.forEach(acc => {
        if (grouped[acc.category]) {
            grouped[acc.category].push(acc);
        }
    });
    return grouped;
}

async function addStock(category, accountData) {
    const account = new Account({
        category,
        name: accountData.name,
        phone: accountData.phone,
        tgId: accountData.tgId,
        price: accountData.price,
        session: accountData.session
    });
    await account.save();
    return account;
}

async function removeStock(category, accountId) {
    await Account.findByIdAndDelete(accountId);
}

async function getUser(userId) {
    return await User.findOne({ userId });
}

async function createUser(userData) {
    const user = new User(userData);
    await user.save();
    return user;
}

async function updateUserBalance(userId, amount) {
    await User.findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } }
    );
}

async function addOrder(userId, orderData) {
    await User.findOneAndUpdate(
        { userId },
        { $push: { orders: orderData } }
    );
}

async function addDeposit(userId, depositData) {
    await User.findOneAndUpdate(
        { userId },
        { $push: { deposits: depositData } }
    );
}

async function getDeposit(depositId) {
    return await Deposit.findOne({ depositId });
}

async function createDeposit(depositData) {
    const deposit = new Deposit(depositData);
    await deposit.save();
    return deposit;
}

async function updateDepositStatus(depositId, status) {
    await Deposit.findOneAndUpdate(
        { depositId },
        { status }
    );
}

async function getAllUsers() {
    return await User.find();
}

async function getTotalStock() {
    return await Account.countDocuments();
}

async function getTotalBalance() {
    const result = await User.aggregate([
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    return result[0]?.total || 0;
}

// ==========================================
// 🎨 UI COMPONENTS
// ==========================================
const UI = {
    top: `<b>◈ ━━━━━━ [ 𝗡𝗢𝗞𝗧𝗘𝗟 𝗦𝗧𝗢𝗥𝗘 ] ━━━━━━ ◈</b>`,
    q: (text) => `<blockquote>${UI.top}\n\n${text}</blockquote>`,
    loading: async (ctx, text) => {
        const frames = ["█▒▒▒▒▒▒▒▒▒ 10%", "███▒▒▒▒▒▒▒ 30%", "█████▒▒▒▒▒ 50%", "███████▒▒▒ 80%", "██████████ 100%"];
        let msg = await ctx.reply(UI.q(`⏳ <b>Loading...</b>` + "\n" + frames[0]), { parse_mode: 'HTML' });
        for (let frame of frames) {
            await new Promise(r => setTimeout(r, 300));
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, UI.q(text + "\n" + frame), { parse_mode: 'HTML' });
        }
        return msg;
    }
};

// ==========================================
// 🚀 BOT FUNCTIONS
// ==========================================

let userState = {};

function getNama(ctx) {
    return `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`;
}

async function checkUserJoin(ctx) {
    for (const channel of CONFIG.CHANNELS) {
        try {
            const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
            if (member.status === 'left' || member.status === 'kicked') {
                return false;
            }
        } catch (e) {
            return false;
        }
    }
    return true;
}

async function renderHome(ctx) {
    const uid = ctx.from.id;
    let user = await getUser(uid);

    if (!user) {
        user = await createUser({
            userId: uid,
            name: ctx.from.first_name,
            username: ctx.from.username || null,
            balance: 0
        });
    }

    let buttons = [
        [Markup.button.callback('🛍️ 𝗕𝗘𝗟𝗔𝗡𝗝𝗔', 'menu_order')],
        [
            Markup.button.callback('💳 𝗗𝗘𝗣𝗢𝗦𝗜𝗧', 'menu_depo'),
            Markup.button.callback('👤 𝗣𝗥𝗢𝗙𝗜𝗟𝗘', 'menu_profile')
        ],
        [
            Markup.button.callback('📦 𝗖𝗘𝗞 𝗦𝗧𝗢𝗞', 'cek_stok'),
            Markup.button.callback('🆘 𝗕𝗔𝗡𝗧𝗨𝗔𝗡', 'butuh_bantuan')
        ]
    ];

    if (uid === CONFIG.ADMIN_ID) {
        buttons.push([
            Markup.button.callback('👑 𝗢𝗪𝗡𝗘𝗥 𝗠𝗘𝗡𝗨', 'owner_menu')
        ]);
    }

    return ctx.replyWithPhoto(CONFIG.MAIN_IMG, {
        caption: UI.q(
`Halo <b>${ctx.from.first_name}</b> 👋

Selamat datang. Di sini kamu bisa membeli <b>Akun NOKTEL Siap Pakai</b> yang sudah siap login dan dikirim otomatis setelah pembayaran berhasil.

💳 <b>Saldo Kamu</b>
<code>Rp ${user.balance.toLocaleString()}</code>

📌 <b>Ketentuan</b>
• Pastikan saldo mencukupi sebelum checkout.
• Periksa pesanan dengan teliti.
• Tidak menerima pembatalan/refund setelah pembayaran.
• Simpan data akun yang diterima dengan aman.

Silakan pilih menu di bawah untuk mulai bertransaksi 👇`
        ),
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
}

async function sendSuccessNotif(ctx, cat, price) {
    const stocks = await getStocks(cat);
    const totalStock = stocks.length;

    const messageText = `<blockquote>
<b>🚀 NEW STOCK BERHASIL DITAMBAHKAN!</b>
━━━━━━━━━━━━━━━━━━━━
📂 <b>Kategori:</b> ID-${cat}
💰 <b>Harga:</b> Rp ${price.toLocaleString()}
📦 <b>Total Stok Tersedia:</b> ${totalStock} Akun
🕒 <b>Update:</b> ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━
🔥 <b>Siap diproses otomatis oleh bot</b>
⚡ <i>Jangan sampai kehabisan!</i>
</blockquote>`;

    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: '🛒 BELI SEKARANG',
                        url: 'https://t.me/storenoktel_bot'
                    }
                ]
            ]
        }
    };

    for (let ch of CONFIG.CHANNELS) {
        try {
            await ctx.telegram.sendMessage(
                ch,
                messageText,
                {
                    parse_mode: 'HTML',
                    ...inlineKeyboard
                }
            );
        } catch (e) {
            console.error(e);
        }
    }
}

// ==========================================
// 🚀 BOT COMMANDS & ACTIONS
// ==========================================

bot.start(async (ctx) => {
    let joined = true;
    for (const ch of CONFIG.CHANNELS) {
        try {
            const member = await ctx.telegram.getChatMember(ch, ctx.from.id);
            if (member.status === 'left' || member.status === 'kicked') {
                joined = false;
                break;
            }
        } catch (e) {
            joined = false;
            break;
        }
    }

    if (!joined) {
        return ctx.reply(
            UI.q(
`❌ <b>AKSES DITOLAK</b>

Untuk menggunakan bot, silakan join channel berikut terlebih dahulu:

👉 @xStoreNoktel  
👉 @StoreRealll

Setelah join, ketik /start kembali.`
            ),
            { parse_mode: 'HTML' }
        );
    }

    return renderHome(ctx);
});

// ==========================================
// 🛒 ORDER SYSTEM
// ==========================================
bot.action('menu_order', async (ctx) => {
    const stocks = await getAllStocks();
    let buttons = [];

    for (let i = 1; i <= 8; i += 2) {
        const stok1 = stocks[i]?.length || 0;
        const stok2 = stocks[i + 1]?.length || 0;

        const icon1 = stok1 > 0 ? '🟢' : '🔴';
        const icon2 = stok2 > 0 ? '🟢' : '🔴';

        buttons.push([
            Markup.button.callback(
                `${icon1} ID ${i} (${stok1})`,
                `view_${i}`
            ),
            Markup.button.callback(
                `${icon2} ID ${i + 1} (${stok2})`,
                `view_${i + 1}`
            )
        ]);
    }

    buttons.push([
        Markup.button.callback('🔙 𝗞𝗘𝗠𝗕𝗔𝗟𝗜', 'back_home')
    ]);

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    await ctx.reply(
        UI.q(
            `<b>🛒 PILIH KATEGORI ID</b>\n` +
            `🟢 = Stok tersedia\n` +
            `🔴 = Stok habis\n\n` +
            `Silahkan pilih kategori yang tersedia.`
        ),
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        }
    );
});

bot.action(/^view_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    const price = await getPrice(id);
    const promoPrice = await getPromo(id);
    const finalPrice = promoPrice || price;
    const stocks = await getStocks(id);
    const count = stocks.length;

    await ctx.deleteMessage();
    await ctx.reply(UI.q(`🛒 <b>𝗞𝗢𝗡𝗙𝗜𝗥𝗠𝗔𝗦𝗜 𝗣𝗘𝗠𝗕𝗘𝗟𝗜𝗔𝗡</b>\n\n🆔 <b>ID Produk:</b> ${id}\n🌍 <b>Negara:</b> Indonesia\n💰 <b>Harga:</b> <code>Rp ${finalPrice.toLocaleString()}</code>${promoPrice ? ' 🔥PROMO' : ''}\n📦 <b>Stok:</b> ${count}\n\nApakah Anda ingin membeli akun ini?`), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ 𝗕𝗘𝗟𝗜 𝗦𝗘𝗞𝗔𝗥𝗔𝗡𝗚', `buy_now_${id}_0`)],
            [Markup.button.callback('❌ 𝗕𝗔𝗧𝗔𝗟', 'menu_order')]
        ])
    });
});

bot.action(/^buy_now_(\d+)_(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1]);
    const index = parseInt(ctx.match[2]);

    let user = await getUser(ctx.from.id);
    if (!user) {
        user = await createUser({
            userId: ctx.from.id,
            name: ctx.from.first_name,
            username: ctx.from.username || null,
            balance: 0
        });
    }

    const stocks = await getStocks(id);
    const price = await getPrice(id);
    const promoPrice = await getPromo(id);
    const finalPrice = promoPrice || price;

    if (user.balance < finalPrice) 
        return ctx.answerCbQuery("⚠️ Saldo tidak cukup!", { show_alert: true });

    if (stocks.length === 0) 
        return ctx.answerCbQuery("⚠️ Stok habis!", { show_alert: true });

    const item = stocks[0]; // Ambil yang pertama
    await removeStock(id, item._id);

    await updateUserBalance(ctx.from.id, -finalPrice);
    user = await getUser(ctx.from.id); // Refresh user data

    // Add to order history
    await addOrder(ctx.from.id, {
        id: `ORD${Date.now()}`,
        category: id.toString(),
        accountName: item.name,
        phone: item.phone,
        price: finalPrice,
        status: 'selesai',
        timestamp: new Date()
    });

    userState[ctx.from.id] = { purchasedAccount: item };

    // Kirim notif ke channel
    if (CONFIG.CHANNELS && CONFIG.CHANNELS.length > 0) {
        const namaUser = getNama(ctx);

        for (const ch of CONFIG.CHANNELS) {
            await ctx.telegram.sendMessage(
                ch,
                `<blockquote>
🛒 <b>PEMBELIAN AKUN BERHASIL</b>

👤 <b>Pembeli:</b> ${namaUser}
🤖 <b>Beli ke:</b> @StoreNoktel_bot

📂 <b>Kategori / ID Produk:</b> ${id}
💰 <b>Harga:</b> Rp ${finalPrice.toLocaleString()}
💳 <b>Sisa Saldo:</b> Rp ${user.balance.toLocaleString()}

⏰ <b>Waktu:</b> ${new Date().toLocaleString()}
</blockquote>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '🤖 Kunjungi Bot',
                                    url: 'https://t.me/StoreNoktel_bot'
                                }
                            ]
                        ]
                    }
                }
            );
        }
    }

    const formatPhone = (phone) => {
        let p = phone.replace(/^0/, '+62');
        return p.replace(/(\d{2,3})(\d{3})(\d{3,4})/, '$1 $2 $3');
    };

    const formattedPhone = formatPhone(item.phone || '-');

    await UI.loading(ctx, "⚙️ <b>𝗠𝗘𝗡𝗬𝗜𝗔𝗣𝗞𝗔𝗡 𝗡𝗢𝗠𝗢𝗥...</b>");

    await ctx.replyWithPhoto(CONFIG.MAIN_IMG, {
        caption: UI.q(
`✅ <b>PEMBELIAN BERHASIL!</b>

📂 <b>Kategori / ID Produk:</b> ${id}
👤 <b>Nama Akun:</b> ${item.name || '-'}
📱 <b>Nomor Telepon:</b> <code>${formattedPhone}</code>
💰 <b>Harga:</b> <code>Rp ${finalPrice.toLocaleString()}</code>
💳 <b>Saldo Tersisa:</b> <code>Rp ${user.balance.toLocaleString()}</code>

📩 Klik tombol di bawah untuk cek SMS/OTP terbaru dari Telegram.`
        ),
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📩 CEK SMS/OTP', 'cek_sms')],
            [Markup.button.callback('🗑️ HAPUS SESI', 'back_home')]
        ])
    });
});

bot.action('cek_sms', async (ctx) => {
    const state = userState[ctx.from.id];

    if (!state || !state.purchasedAccount) {
        return ctx.answerCbQuery("❌ Data akun tidak ditemukan", { show_alert: true });
    }

    const account = state.purchasedAccount;

    const msg = await ctx.reply('⏳ Menghubungi sesi Telegram...');

    try {
        const client = new TelegramClient(
            new StringSession(account.session),
            CONFIG.API_ID,
            CONFIG.API_HASH,
            { connectionRetries: 5 }
        );

        await client.connect();

        const messages = await client.getMessages(777000, { limit: 1 });

        if (messages.length > 0 && messages[0].message) {
            const smsMsg = messages[0].message;
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                null,
                `📩 PESAN TERAKHIR (OTP/SMS):\n\n${smsMsg}`
            );
        } else {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                null,
                '❌ Tidak ada pesan masuk dari Telegram.'
            );
        }

        await client.disconnect();
    } catch (err) {
        console.error(err);
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            null,
            `❌ ERROR saat membaca pesan: ${err.message}`
        );
    }
});

// ==========================================
// 💳 DEPOSIT SYSTEM (ATLANTIC H2H)
// ==========================================
bot.action('menu_depo', async (ctx) => {
    await ctx.deleteMessage();
    userState[ctx.from.id] = { step: 'INPUT_DEPO' };
    await ctx.reply(UI.q(`💳 <b>𝗗𝗘𝗣𝗢𝗦𝗜𝗧 𝗦𝗔𝗟𝗗𝗢</b>\n\nSilahkan masukkan nominal deposit.\nContoh: <code>15000</code>`), { parse_mode: 'HTML' });
});

bot.on('text', async (ctx) => {
    const uid = ctx.from.id;
    const text = ctx.message.text;
    const state = userState[uid];

    /* ==================================================
       👑 OWNER/ADMIN REPLY HANDLER
    ================================================== */
    if (uid === CONFIG.ADMIN_ID) {
        const ownerKeys = Object.keys(userState)
            .filter(k => userState[k]?.step === 'WAIT_REPLY');

        if (ownerKeys.length > 0) {
            for (let key of ownerKeys) {
                const { to: userId, userName } = userState[key];
                try {
                    await ctx.telegram.sendMessage(
                        userId,
                        UI.q(`💬 Balasan dari Owner:\n\n${text}`),
                        { parse_mode: 'HTML' }
                    );
                    delete userState[key];
                    await ctx.reply(
                        `✅ Balasan berhasil dikirim ke <b>${userName}</b> (ID: ${userId})`,
                        { parse_mode: 'HTML' }
                    );
                } catch {
                    await ctx.reply(
                        `❌ Gagal mengirim pesan ke <b>${userName}</b> (ID: ${userId})`,
                        { parse_mode: 'HTML' }
                    );
                }
            }
            return;
        }
    }

    /* ==================================================
       📢 BROADCAST & PROMO
    ================================================== */
    if (state?.step === 'SET_PROMO_PRICE' && uid === CONFIG.ADMIN_ID) {
        const price = parseInt(text);
        if (isNaN(price) || price <= 0) return ctx.reply("❌ Harga tidak valid");

        const cat = state.cat;
        await setPromo(cat, price);

        delete userState[uid];

        for (const ch of CONFIG.CHANNELS) {
            const normalPrice = await getPrice(cat);
            await ctx.telegram.sendMessage(
                ch,
`🔥 <b>PROMO SPESIAL!</b>

📂 Kategori: ${cat}
💰 Harga Normal: Rp ${normalPrice.toLocaleString()}
🎉 Harga Promo: Rp ${price.toLocaleString()}

⚡ Buruan sebelum stok habis!`,
                { parse_mode: 'HTML' }
            );
        }
        return ctx.reply(UI.q(`✅ Promo berhasil diset ke Rp ${price.toLocaleString()}`), { parse_mode: 'HTML' });
    }

   if (state?.step === 'BROADCAST' && uid === CONFIG.ADMIN_ID) {
        delete userState[uid];
        const users = await getAllUsers();
        const totalUser = users.length;
        let sukses = 0;
        let gagal = 0;

        let statusMsg = await ctx.reply(
            UI.q(`📢 <b>MEMULAI BROADCAST...</b>\n\n` +
                 `⏳ Progres: <code>[░░░░░░░░░░] 0%</code>\n` +
                 `✅ Berhasil: 0 | ❌ Gagal: 0`), 
            { parse_mode: 'HTML' }
        );

        for (let i = 0; i < totalUser; i++) {
            const targetId = users[i].userId;
            try {
                await ctx.telegram.sendMessage(targetId, text, { parse_mode: 'HTML' });
                sukses++;
            } catch (err) {
                gagal++;
            }

            if (i % 5 === 0 || i === totalUser - 1) {
                const percent = Math.round(((i + 1) / totalUser) * 100);
                const progress = Math.round(percent / 10);
                const bar = "█".repeat(progress) + "░".repeat(10 - progress);

                try {
                    await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        statusMsg.message_id,
                        null,
                        UI.q(
                            `📢 <b>SEDANG BROADCAST...</b>\n\n` +
                            `⏳ Progres: <code>[${bar}] ${percent}%</code>\n` +
                            `✅ Berhasil: <b>${sukses}</b>\n` +
                            `❌ Gagal: <b>${gagal}</b>\n` +
                            `👥 Total: ${totalUser}`
                        ),
                        { parse_mode: 'HTML' }
                    );
                } catch (e) {}
            }
        }

        return ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            null,
            UI.q(
                `✅ <b>BROADCAST SELESAI!</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                `📊 <b>LAPORAN HASIL:</b>\n` +
                `🟢 Berhasil : <b>${sukses}</b> user\n` +
                `🔴 Gagal    : <b>${gagal}</b> user\n` +
                `👥 Total    : <b>${totalUser}</b> user\n\n` +
                `✨ <i>Pesan telah terkirim ke semua tujuan.</i>`
            ),
            { parse_mode: 'HTML' }
        );
    }

    /* ==================================================
       🆘 BUTUH BANTUAN (USER SIDE)
    ================================================== */
    if (state?.step === 'BUTUH_BANTUAN') {
        const msg = text;
        const userName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
        const userId = ctx.from.id;
        const ownerId = CONFIG.ADMIN_ID;

        await ctx.telegram.sendMessage(ownerId,
`🆘 <b>Pesan Bantuan Baru</b>

👤 Dari: ${userName}
🆔 UserID: <code>${userId}</code>

📩 Pesan:
${msg}`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('💬 Balas', `balas_${userId}`)]])
        });

        delete userState[uid];
        return ctx.reply(UI.q('✅ Pesan bantuan telah dikirim ke owner. Mohon tunggu balasan.'), { parse_mode: 'HTML' });
    }

    /* ==================================================
       💳 USER DEPOSIT
    ================================================== */
    if (state?.step === 'INPUT_DEPO') {
        const nominal = parseInt(text);
        if (isNaN(nominal) || nominal < 1000) {
            return ctx.reply(UI.q("❌ Nominal minimal Rp 1.000"), { parse_mode: 'HTML' });
        }

        await UI.loading(ctx, "🔄 <b>𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗜𝗡𝗚 𝗤𝗥𝗜𝗦...</b>");
        const reff_id = randomString(10);
        const body = new URLSearchParams({
            api_key: CONFIG.API_KEY_ATLANTIC,
            reff_id,
            nominal,
            type: 'ewallet',
            metode: 'qris'
        });

        const res = await fetch(`${CONFIG.BASE_URL_ATLANTIC}/deposit/create`, { method: 'POST', body }).then(r => r.json());

        if (!res.status) {
            delete userState[uid];
            return ctx.reply(UI.q("❌ Gagal membuat QRIS"), { parse_mode: 'HTML' });
        }

        const qrBuffer = await QRCode.toBuffer(res.data.qr_string);
        const sentMsg = await ctx.replyWithPhoto(
            { source: qrBuffer },
            {
                caption: UI.q(
`🛒 <b>𝗣𝗘𝗠𝗕𝗔𝗬𝗔𝗥𝗔𝗡 𝗤𝗥𝗜𝗦</b>

🆔 <b>ID Deposit:</b> <code>${res.data.id}</code>
💰 <b>Nominal:</b> <code>Rp ${res.data.nominal.toLocaleString()}</code>
📥 <b>Saldo Diterima:</b> <code>Rp ${(res.data.get_balance || res.data.nominal).toLocaleString()}</code>
⏳ <b>Status:</b> <i>PENDING</i>

📌 <i>Scan QRIS untuk melanjutkan. Saldo masuk otomatis.</i>`
                ),
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 CEK STATUS', `check_depo_${res.data.id}`)],
                    [Markup.button.callback('❌ BATAL', `cancel_depo_${res.data.id}`)]
                ])
            }
        );

        await createDeposit({
            depositId: res.data.id,
            user_id: uid,
            chat_id: ctx.chat.id,
            msg_id: sentMsg.message_id,
            status: 'pending',
            nominal: res.data.nominal
        });

        delete userState[uid];
        return;
    }

    /* ==================================================
       👑 ADMIN ADD STOK (JALUR GABUNGAN)
    ================================================== */
    if (uid === CONFIG.ADMIN_ID) {
        
        if (state?.step === 'ADMIN_NAME') {
            state.name = text.trim();
            state.step = 'ADMIN_PHONE';
            return ctx.reply(UI.q("📱 Kirim <b>Nomor HP</b> (untuk OTP) atau <b>String Session</b>:"), { parse_mode: 'HTML' });
        }

        if (state?.step === 'ADMIN_PHONE') {
            const input = text.trim();

            // CEK STRING SESSION
            if (input.length > 50) {
                await UI.loading(ctx, "🔄 <b>Verifikasi Session...</b>");
                try {
                    const client = new TelegramClient(new StringSession(input), CONFIG.API_ID, CONFIG.API_HASH, { connectionRetries: 5 });
                    await client.connect();
                    const me = await client.getMe();
                    state.tempAccount = {
                        name: `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'No Name',
                        phone: me.phone,
                        tgId: me.id.toString(),
                        session: input
                    };
                    state.step = 'ADMIN_PRICE_FINAL';
                    await client.disconnect();

                    return ctx.reply(UI.q(
                        `✨ <b>ACCOUNT DETECTED (SESSION)</b>\n━━━━━━━━━━━━━━━━━━━━━━\n👤 <b>Name:</b> <code>${state.tempAccount.name}</code>\n📱 <b>Phone:</b> <code>${state.tempAccount.phone}</code>\n🆔 <b>TG-ID:</b> <code>${state.tempAccount.tgId}</code>\n\n💰 <b>Masukkan Harga Jual:</b>`
                    ), { parse_mode: 'HTML' });
                } catch (err) {
                    delete userState[uid];
                    return ctx.reply(UI.q("❌ String Session tidak valid."));
                }
            }

            // CEK NOMOR HP
            const phone = input.replace(/[^0-9]/g, '');
            if (phone.length < 8) return ctx.reply(UI.q("❌ Kirim Nomor HP / String Session valid."));
            state.phone = phone;
            state.step = 'ADMIN_PRICE';
            return ctx.reply(UI.q(`💰 Nomor diterima: <code>${phone}</code>\n\nMasukkan <b>Harga Jual</b>:`), { parse_mode: 'HTML' });
        }

        if (state?.step === 'ADMIN_PRICE') {
            const price = parseInt(text);
            if (isNaN(price) || price < 1000) return ctx.reply(UI.q("❌ Harga minimal 1000"));
            state.price = price;
            state.step = 'ADMIN_OTP';
            await UI.loading(ctx, "📩 <b>Mengirim OTP...</b>");
            try {
                const client = new TelegramClient(new StringSession(""), CONFIG.API_ID, CONFIG.API_HASH, { connectionRetries: 5 });
                await client.connect();
                const { phoneCodeHash } = await client.sendCode({ apiId: CONFIG.API_ID, apiHash: CONFIG.API_HASH }, state.phone);
                state.client = client;
                state.phoneCodeHash = phoneCodeHash;
                return ctx.reply(UI.q("📩 <b>OTP DIKIRIM!</b>\nMasukkan kode OTP:"), { parse_mode: 'HTML' });
            } catch {
                delete userState[uid];
                return ctx.reply(UI.q("❌ Gagal kirim OTP."));
            }
        }

        if (state?.step === 'ADMIN_OTP') {
            const otp = text.replace(/\s+/g, '');
            try {
                await state.client.invoke(new Api.auth.SignIn({ phoneNumber: state.phone, phoneCodeHash: state.phoneCodeHash, phoneCode: otp }));
                const me = await state.client.getMe();
                const session = state.client.session.save();
                
                // Simpan ke MongoDB
                await addStock(state.cat, {
                    name: state.name || me.firstName,
                    phone: state.phone,
                    tgId: me.id.toString(),
                    price: state.price,
                    session: session
                });
                
                await setPrice(state.cat, state.price);
                delete userState[uid];
                await sendSuccessNotif(ctx, state.cat, state.price);
                return ctx.reply(UI.q("✅ <b>BERHASIL:</b> Akun ditambahkan via OTP!"));
            } catch {
                delete userState[uid];
                return ctx.reply(UI.q("❌ OTP salah atau limit."));
            }
        }

        if (state?.step === 'ADMIN_PRICE_FINAL') {
            const price = parseInt(text);
            if (isNaN(price) || price < 1000) return ctx.reply(UI.q("❌ Harga minimal 1000"));
            const acc = state.tempAccount;
            
            // Simpan ke MongoDB
            await addStock(state.cat, {
                name: acc.name,
                phone: acc.phone,
                tgId: acc.tgId,
                price: price,
                session: acc.session
            });
            
            await setPrice(state.cat, price);
            delete userState[uid];
            await sendSuccessNotif(ctx, state.cat, price);
            return ctx.reply(UI.q("✅ <b>BERHASIL:</b> Akun ditambahkan via Session!"));
        }

        /* =========================
           💰 MANAGEMENT SALDO
        ========================= */
        if (state?.step === 'ADD_SALDO_TARGET' || state?.step === 'MINUS_SALDO_TARGET') {
            const input = text.trim();
            let user;
            
            if (/^\d+$/.test(input)) {
                user = await getUser(parseInt(input));
            } else {
                const username = input.replace('@', '').toLowerCase();
                user = await User.findOne({ username: username });
            }
            
            if (!user) return ctx.reply(UI.q("❌ User tidak ditemukan"));
            state.targetUser = user;
            state.step = state.step === 'ADD_SALDO_TARGET' ? 'ADD_SALDO_AMOUNT' : 'MINUS_SALDO_AMOUNT';
            return ctx.reply(UI.q(`💰 Masukkan <b>jumlah saldo</b>:`), { parse_mode: 'HTML' });
        }

        if (state?.step === 'ADD_SALDO_AMOUNT' || state?.step === 'MINUS_SALDO_AMOUNT') {
            const amount = parseInt(text);
            if (isNaN(amount) || amount <= 0) return ctx.reply(UI.q("❌ Jumlah tidak valid"));
            const user = state.targetUser;
            if (state.step === 'MINUS_SALDO_AMOUNT' && user.balance < amount) return ctx.reply(UI.q("❌ Saldo tidak mencukupi"));
            
            const change = state.step === 'ADD_SALDO_AMOUNT' ? amount : -amount;
            await updateUserBalance(user.userId, change);
            
            delete userState[uid];
            const updatedUser = await getUser(user.userId);
            return ctx.reply(UI.q(`✅ <b>UPDATE BERHASIL</b>\n👤 User: ${updatedUser.name}\n💳 Saldo: <code>Rp ${updatedUser.balance.toLocaleString()}</code>`), { parse_mode: 'HTML' });
        }
    }
});

bot.action(/^check_depo_(.+)$/, async (ctx) => {
    const depoId = ctx.match[1];
    const uid = ctx.from.id;

    await ctx.answerCbQuery("🔄 Mengecek status deposit...");

    const depo = await getDeposit(depoId);
    if (!depo) {
        return ctx.answerCbQuery("❌ Deposit tidak ditemukan", { show_alert: true });
    }

    try {
        const body = new URLSearchParams({
            api_key: CONFIG.API_KEY_ATLANTIC,
            id: depoId
        });

        const res = await fetch(`${CONFIG.BASE_URL_ATLANTIC}/deposit/status`, { method: 'POST', body })
            .then(r => r.json());

        if (!res.status) {
            return ctx.answerCbQuery("❌ Gagal cek status", { show_alert: true });
        }

        const status = res.data.status;

        if (status === 'success') {
            if (depo.status === 'success') {
                return ctx.answerCbQuery("✅ Deposit sudah masuk sebelumnya", { show_alert: true });
            }

            const saldo = parseInt(res.data.get_balance || 0);
            await updateUserBalance(uid, saldo);
            await updateDepositStatus(depoId, 'success');

            await ctx.telegram.deleteMessage(depo.chat_id, depo.msg_id);

            // Add to deposit history
            await addDeposit(uid, {
                id: depoId,
                nominal: saldo,
                method: 'QRIS',
                status: 'sukses',
                timestamp: new Date()
            });

            for (const ch of CONFIG.CHANNELS) {
                await ctx.telegram.sendMessage(
                    ch,
                    `💳 <b>DEPOSIT BERHASIL</b>

👤 Username: @${ctx.from.username || ctx.from.first_name}
🆔 ID: ${uid}

💰 Nominal Masuk: Rp ${saldo.toLocaleString()}

⏰ ${new Date().toLocaleString()}`,
                    { parse_mode: 'HTML' }
                );
            }

            const user = await getUser(uid);
            return ctx.reply(
                UI.q(
`✅ <b>DEPOSIT BERHASIL</b>

💰 Saldo Masuk:
<code>Rp ${saldo.toLocaleString()}</code>

💳 Saldo Sekarang:
<code>Rp ${user.balance.toLocaleString()}</code>`
                ),
                { parse_mode: 'HTML' }
            );
        }

        if (status === 'pending') {
            return ctx.answerCbQuery(
                "⏳ Deposit masih PENDING\nSilakan selesaikan pembayaran QRIS",
                { show_alert: true }
            );
        }

        if (status === 'processing') {
            const instantBody = new URLSearchParams({
                api_key: CONFIG.API_KEY_ATLANTIC,
                id: depoId,
                action: 'true'
            });

            const instantRes = await fetch(`${CONFIG.BASE_URL_ATLANTIC}/deposit/instant`, {
                method: 'POST',
                body: instantBody
            }).then(r => r.json());

            if (!instantRes.status) {
                return ctx.answerCbQuery("❌ Gagal memproses deposit instant", { show_alert: true });
            }

            const nominal = parseInt(instantRes.data.total_diterima || 0);
            await updateUserBalance(uid, nominal);
            await updateDepositStatus(depoId, 'success');

            await ctx.telegram.deleteMessage(depo.chat_id, depo.msg_id);

            // Add to deposit history
            await addDeposit(uid, {
                id: depoId,
                nominal: nominal,
                method: 'QRIS Instant',
                status: 'sukses',
                timestamp: new Date()
            });

            if (CONFIG.CHANNELS && CONFIG.CHANNELS.length > 0) {
                const namaUser = getNama(ctx);
                const user = await getUser(uid);

                for (const ch of CONFIG.CHANNELS) {
                    await ctx.telegram.sendMessage(
                        ch,
                        `<blockquote>
💳 <b>DEPOSIT INSTANT BERHASIL</b>

👤 <b>Nama:</b> ${namaUser}
🆔 <b>User ID:</b> ${uid}
📛 <b>First Name:</b> ${ctx.from.first_name || '-'}
📛 <b>Last Name:</b> ${ctx.from.last_name || '-'}

🤖 <b>Deposit ke:</b> @StoreNoktel_bot
📊 <b>Status Akun:</b> ${user.role || 'Member'}

💰 <b>Nominal Masuk:</b> Rp ${nominal.toLocaleString()}
💳 <b>Saldo Sebelumnya:</b> Rp ${(user.balance - nominal).toLocaleString()}
💳 <b>Saldo Sekarang:</b> Rp ${user.balance.toLocaleString()}

🕒 <b>Waktu Server:</b> ${new Date().toLocaleString()}
🌍 <b>Timezone:</b> ${Intl.DateTimeFormat().resolvedOptions().timeZone}
</blockquote>`,
                        {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: '🤖 Kunjungi Bot',
                                            url: 'https://t.me/StoreNoktel_bot'
                                        }
                                    ]
                                ]
                            }
                        }
                    );
                }
            }

            const user = await getUser(uid);
            return ctx.reply(
                UI.q(
`✅ <b>DEPOSIT BERHASIL (INSTANT)</b>

💰 Nominal Masuk:
<code>Rp ${nominal.toLocaleString()}</code>

💳 Saldo Sekarang:
<code>Rp ${user.balance.toLocaleString()}</code>`
                ),
                { parse_mode: 'HTML' }
            );
        }

        return ctx.answerCbQuery(`⚠️ Status: ${status}`, { show_alert: true });

    } catch (err) {
        console.error("CHECK DEPO ERROR:", err);
        return ctx.answerCbQuery("❌ Error saat cek deposit", { show_alert: true });
    }
});

bot.action(/^cancel_depo_(.+)$/, async (ctx) => {
    const depoId = ctx.match[1];
    const depo = await getDeposit(depoId);

    await ctx.answerCbQuery("⏳ Membatalkan deposit...");

    if (!depo) {
        return ctx.answerCbQuery("❌ Deposit tidak ditemukan", { show_alert: true });
    }

    if (depo.user_id !== ctx.from.id) {
        return ctx.answerCbQuery("❌ Bukan deposit kamu", { show_alert: true });
    }

    try {
        await fetch(
            `${CONFIG.BASE_URL_ATLANTIC}/deposit/cancel`,
            {
                method: 'POST',
                body: new URLSearchParams({
                    api_key: CONFIG.API_KEY_ATLANTIC,
                    id: depoId
                })
            }
        );

        await ctx.telegram.deleteMessage(depo.chat_id, depo.msg_id);
        await updateDepositStatus(depoId, 'cancel');

        return ctx.reply(
            UI.q(
`❌ <b>DEPOSIT DIBATALKAN</b>

QRIS dan detail pembayaran
telah dihapus.`
            ),
            { parse_mode: 'HTML' }
        );

    } catch (err) {
        console.error("CANCEL DEPO ERROR:", err);
        return ctx.answerCbQuery(
            "❌ Gagal membatalkan deposit",
            { show_alert: true }
        );
    }
});

bot.action('cek_stok', async (ctx) => {
    const uid = ctx.from.id;

    try { await ctx.deleteMessage(); } catch(e){}

    const stocks = await getAllStocks();
    let text = '<b>📦 STOK AKUN TERSEDIA</b>\n\n';
    
    for (let cat in stocks) {
        const items = stocks[cat];
        if (items.length === 0) continue;
        text += `<b>📂 Kategori ${cat}</b> | Jumlah: ${items.length}\n`;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            text += `- ID: ${i+1}, Nama: ${item.name}, Harga: Rp ${item.price.toLocaleString()}\n`;
        }
        text += '\n';
    }

    if (text === '<b>📦 STOK AKUN TERSEDIA</b>\n\n') {
        text += '❌ Tidak ada stok tersedia';
    }

    await ctx.reply(UI.q(text), { parse_mode: 'HTML' });
});

// ==============================
// BUTUH BANTUAN
// ==============================
bot.action('butuh_bantuan', async (ctx) => {
    const uid = ctx.from.id;
    userState[uid] = { step: 'BUTUH_BANTUAN' };

    try { await ctx.deleteMessage(); } catch(e){}

    await ctx.reply(UI.q('🆘 Silakan tulis pesan bantuan Anda. Pesan ini akan dikirim ke owner.'), { parse_mode: 'HTML' });
});

// ==============================
// BALAS PESAN OWNER
// ==============================
bot.action(/^balas_(\d+)$/, async (ctx) => {
    const userId = ctx.match[1];
    userState['owner_reply'] = { to: userId, step: 'WAIT_REPLY' };
    try { await ctx.deleteMessage(); } catch(e){}
    await ctx.reply('✏️ Silakan tulis pesan balasan untuk user ini:');
});

bot.action('menu_profile', async (ctx) => {
    const uid = ctx.from.id;
    const user = await getUser(uid);
    if (!user) return ctx.reply("❌ Data user tidak ditemukan");

    try { await ctx.deleteMessage(); } catch (e) {}

    const orders = user.orders || [];
    const totalOrder = orders.length;
    const orderSukses = orders.filter(o => o.status.toLowerCase() === 'selesai').length;
    const orderGagal = orders.filter(o => o.status.toLowerCase() === 'gagal').length;

    const deposits = user.deposits || [];
    const totalDeposit = deposits.length;
    const depositSukses = deposits.filter(d => d.status.toLowerCase() === 'sukses').length;
    const depositPending = deposits.filter(d => d.status.toLowerCase() === 'pending').length;

    const caption = UI.q(
`👤 <b>Nama:</b> ${user.name}
🆔 <b>User ID:</b> ${uid}
📛 <b>Username:</b> ${user.username || '-'}
💰 <b>Saldo:</b> Rp ${user.balance.toLocaleString()}

📦 <b>Riwayat Order:</b>
Total: ${totalOrder} | Selesai: ${orderSukses} | Gagal: ${orderGagal}

💳 <b>Riwayat Deposit:</b>
Total: ${totalDeposit} | Sukses: ${depositSukses} | Pending: ${depositPending}`
    );

    await ctx.replyWithPhoto(CONFIG.MAIN_IMG, {
        caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📦 Riwayat Order', `profile_order`)],
            [Markup.button.callback('💳 Riwayat Deposit', `profile_deposit`)],
            [Markup.button.callback('🔙 Kembali', 'back_home')]
        ])
    });
});

bot.action('profile_order', async (ctx) => {
    const uid = ctx.from.id;
    const user = await getUser(uid);
    const orders = user?.orders || [];

    try { await ctx.deleteMessage(); } catch(e){}

    if (orders.length === 0) return ctx.reply(UI.q('❌ Belum ada riwayat order'), { parse_mode: 'HTML' });

    const buttons = orders.map(o => 
        [Markup.button.callback(`ID: ${o.id} | Rp ${o.price.toLocaleString()}`, `order_detail_${o.id}`)]
    );
    buttons.push([Markup.button.callback('🔙 Kembali', 'menu_profile')]);

    await ctx.reply(
        UI.q('<b>📦 RIWAYAT ORDER ANDA</b>\nKlik untuk melihat detail setiap order'),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
});

bot.action('profile_deposit', async (ctx) => {
    const uid = ctx.from.id;
    const user = await getUser(uid);
    const deposits = user?.deposits || [];

    try { await ctx.deleteMessage(); } catch(e){}

    if (deposits.length === 0) return ctx.reply(UI.q('❌ Belum ada riwayat deposit'), { parse_mode: 'HTML' });

    const buttons = deposits.map(d => 
        [Markup.button.callback(`ID: ${d.id} | Rp ${d.nominal.toLocaleString()}`, `deposit_detail_${d.id}`)]
    );
    buttons.push([Markup.button.callback('🔙 Kembali', 'menu_profile')]);

    await ctx.reply(
        UI.q('<b>💰 RIWAYAT DEPOSIT ANDA</b>\nKlik untuk melihat detail tiap deposit'),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
});

bot.action(/^deposit_detail_(.+)$/, async (ctx) => {
    const depoId = ctx.match[1];
    const uid = ctx.from.id;
    const user = await getUser(uid);
    const depo = (user?.deposits || []).find(d => d.id === depoId);

    if (!depo) return ctx.answerCbQuery("❌ Deposit tidak ditemukan", { show_alert: true });

    try { await ctx.deleteMessage(); } catch(e){}

    const msg = await ctx.reply(UI.q("⏳ <b>Mengambil detail pembayaran...</b>\n█▒▒▒▒▒▒ 10%"));
    const frames = ["█▒▒▒▒▒▒ 10%", "███▒▒▒▒▒ 30%", "█████▒▒▒ 50%", "███████▒▒ 80%", "█████████ 100%"];
    for (let f of frames) {
        await new Promise(r => setTimeout(r, 300));
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
            UI.q(`<b>Detail Deposit</b>\n⏳ Loading...\n${f}`), { parse_mode: 'HTML' }
        );
    }

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        UI.q(
`💳 <b>DETAIL DEPOSIT</b>

🆔 ID Deposit: <code>${depo.id}</code>
💰 Nominal: Rp ${depo.nominal?.toLocaleString() || 0}
💳 Metode: ${depo.method || 'QRIS / E-wallet'}
📦 Status: <b>${depo.status.toUpperCase()}</b>
⏰ Tanggal: ${new Date(depo.timestamp || Date.now()).toLocaleString()}`
        ),
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Kembali', 'profile_deposit')]
            ])
        }
    );
});

bot.action(/^order_detail_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const uid = ctx.from.id;
    const user = await getUser(uid);
    const order = (user?.orders || []).find(o => o.id === orderId);

    if (!order) return ctx.answerCbQuery('❌ Order tidak ditemukan', { show_alert: true });

    try { await ctx.deleteMessage(); } catch(e){}

    const msg = await ctx.reply(UI.q('⏳ <b>Mengambil detail order...</b>\n█▒▒▒▒▒ 10%'));
    const frames = ["█▒▒▒▒▒ 10%", "███▒▒▒▒ 30%", "█████▒▒ 50%", "███████ 80%", "█████████ 100%"];
    for (let f of frames) {
        await new Promise(r => setTimeout(r, 300));
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
            UI.q(`<b>Detail Order</b>\n⏳ Loading...\n${f}`), { parse_mode: 'HTML' }
        );
    }

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        UI.q(
`📦 <b>DETAIL ORDER</b>

🆔 Order ID: ${order.id}
📂 Kategori: ${order.category || '-'}
👤 Nama Akun: ${order.accountName || '-'}
📱 Nomor: <code>${order.phone || '-'}</code>
💰 Harga: Rp ${order.price.toLocaleString()}
📦 Status: <b>${order.status.toUpperCase()}</b>
⏰ Tanggal: ${new Date(order.timestamp).toLocaleString()}`
        ),
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Kembali', 'profile_order')]
            ])
        }
    );
});

// ==========================================
// 👑 ADMIN MENU (STEP BY STEP)
// ==========================================
bot.action('owner_menu', async (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID) {
        return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });
    }

    const totalUsers = (await getAllUsers()).length;
    const activeUsers = (await getAllUsers()).filter(u => u.balance > 0).length;
    const totalStock = await getTotalStock();
    const totalBalance = await getTotalBalance();
    const totalPromo = Object.keys(await Settings.find({ key: /^promo_/ })).length;
    const maintenance = await getMaintenance();

    const uptimeMs = Date.now() - BOT_START_TIME;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);

    try {
        await ctx.editMessageCaption(
            UI.q(`👑 <b>OWNER CONTROL PANEL</b>

📊 <b>STATISTIK BOT</b>
━━━━━━━━━━━━━━━━
👥 Total User     : ${totalUsers}
🟢 User Aktif     : ${activeUsers}
📦 Total Stok     : ${totalStock}
💰 Total Saldo    : Rp ${totalBalance.toLocaleString()}
🔥 Promo Aktif    : ${totalPromo}
⏳ Uptime         : ${hours} Jam ${minutes} Menit

Silahkan pilih aksi admin:`),
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([

                    [Markup.button.callback('➕ 𝗔𝗗𝗗 𝗦𝗧𝗢𝗞', 'adm_add')],

                    [
                        Markup.button.callback('➕ 𝗧𝗔𝗠𝗕𝗔𝗛 𝗦𝗔𝗟𝗗𝗢', 'adm_addsaldo'),
                        Markup.button.callback('➖ 𝗞𝗨𝗥𝗔𝗡𝗚𝗜 𝗦𝗔𝗟𝗗𝗢', 'adm_minussaldo')
                    ],

                    [Markup.button.callback('🔥 𝗣𝗥𝗢𝗠𝗢', 'adm_promo')],

                    [
                        Markup.button.callback('📢 𝗕𝗥𝗢𝗔𝗗𝗖𝗔𝗦𝗧', 'adm_bc'),
                        Markup.button.callback(
                            maintenance ? '🛑 MAINTENANCE: ON' : '🟢 MAINTENANCE: OFF',
                            'adm_mt'
                        )
                    ],

                    [Markup.button.callback('🔙 𝗕𝗔𝗖𝗞', 'back_home')]

                ])
            }
        );
    } catch (err) {
        console.log(err);
    }
});

bot.action('adm_addsaldo', (ctx) => {
    userState[ctx.from.id] = { step: 'ADD_SALDO_TARGET' };
    ctx.reply(UI.q("🆔 Masukkan <b>ID atau Username</b> user:"), { parse_mode: 'HTML' });
});

bot.action('adm_minussaldo', (ctx) => {
    userState[ctx.from.id] = { step: 'MINUS_SALDO_TARGET' };
    ctx.reply(UI.q("🆔 Masukkan <b>ID atau Username</b> user:"), { parse_mode: 'HTML' });
});

bot.action('adm_add', async (ctx) => {
    let btns = [];
    for (let i = 1; i <= 8; i++) {
        btns.push(Markup.button.callback(`Kategori ${i}`, `add_cat_${i}`));
    }

    await ctx.editMessageCaption(
        UI.q("📂 <b>𝗣𝗜𝗟𝗜𝗛 𝗞𝗔𝗧𝗘𝗚𝗢𝗥𝗜:</b>"),
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(btns, { columns: 2 })
        }
    );
});

bot.action(/^add_cat_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID) return;
    const cat = ctx.match[1];

    await ctx.editMessageCaption(
        UI.q(`📂 <b>KATEGORI ${cat}</b>\n\nSilahkan pilih metode penambahan akun:`),
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📩 VIA OTP', `method_otp_${cat}`)],
                [Markup.button.callback('🔑 VIA STRING SESSION', `method_string_${cat}`)],
                [Markup.button.callback('🔙 KEMBALI', 'adm_add')]
            ])
        }
    );
});

bot.action(/^method_otp_(\d+)$/, (ctx) => {
    const cat = ctx.match[1];
    userState[ctx.from.id] = { step: 'ADMIN_NAME', cat, method: 'OTP' };
    ctx.reply(UI.q("👤 Masukkan <b>Nama Akun</b>:"), { parse_mode: 'HTML' });
});

bot.action(/^method_string_(\d+)$/, (ctx) => {
    const cat = ctx.match[1];
    userState[ctx.from.id] = { step: 'ADMIN_PHONE', cat, method: 'STRING' };
    ctx.reply(UI.q("🔑 Silahkan kirim <b>String Session</b> akun:"), { parse_mode: 'HTML' });
});

bot.action('adm_promo', async (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID)
        return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });

    let btns = [];
    for (let i = 1; i <= 8; i++) {
        btns.push(
            Markup.button.callback(`Kategori ${i}`, `promo_cat_${i}`)
        );
    }

    await ctx.reply(
        UI.q("🔥 <b>PILIH KATEGORI YANG INGIN DIPROMO</b>"),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns, { columns: 2 }) }
    );
});

bot.action(/^promo_cat_(\d+)$/, (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID) return;

    const cat = ctx.match[1];

    userState[ctx.from.id] = {
        step: 'SET_PROMO_PRICE',
        cat
    };

    ctx.reply(
        UI.q(`💰 Masukkan harga promo untuk Kategori ${cat}\n\nContoh: 3000`),
        { parse_mode: 'HTML' }
    );
});

bot.action('adm_bc', (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID)
        return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });

    userState[ctx.from.id] = { step: 'BROADCAST' };

    ctx.reply(
        UI.q("📢 Kirim pesan yang ingin dibroadcast ke semua user:"),
        { parse_mode: 'HTML' }
    );
});

bot.action('adm_mt', async (ctx) => {
    if (ctx.from.id !== CONFIG.ADMIN_ID)
        return ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true });

    const current = await getMaintenance();
    await setMaintenance(!current);

    ctx.reply(
        UI.q(
            !current
                ? "🛠️ Maintenance AKTIF\nUser tidak bisa menggunakan bot."
                : "✅ Maintenance NONAKTIF\nBot sudah normal kembali."
        ),
        { parse_mode: 'HTML' }
    );
});

bot.action('back_home', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch {}

    return renderHome(ctx);
});

// ==========================================
// 🚀 START BOT
// ==========================================

async function startBot() {
    await connectDB();
    bot.launch();
    console.log("🚀 BOT PREMIUM ONLINE (MONGODB EDITION)");
}

startBot();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
