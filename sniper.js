// ═══════════════════════════════════════════════════════
//  DISCORD MFA SNIPER v2.1
//  Tek dosya - Windows VDS
// ═══════════════════════════════════════════════════════

const { initMFA } = require('discord-mfa');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ─────────── CONFIG ───────────
const CONFIG = {
    TOKEN: process.env.TOKEN || '',
    PASSWORD: process.env.PASSWORD || '',
    TWO_FA: process.env.TWO_FA || '',
    GUILD_ID: process.env.GUILD_ID || '',
    TARGET_VANITY: process.env.TARGET_VANITY || '',
    WEBHOOK: process.env.WEBHOOK || '',
    INTERVAL: parseInt(process.env.INTERVAL) || 100,
    DEBUG: process.env.DEBUG === 'true',
    API: process.env.API || 'https://discord.com/api/v10',
    UA: process.env.UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    LOG_DIR: path.join(__dirname, 'logs'),
};

// ─────────── STATE ───────────
const STATE = {
    checks: 0,
    attempts: 0,
    success: 0,
    rateLimits: 0,
    errors: 0,
    mfaStatus: 'YOK',
    startTime: Date.now(),
};

// ─────────── LOGGER ───────────
if (!fs.existsSync(CONFIG.LOG_DIR)) fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
const LOG_FILE = path.join(CONFIG.LOG_DIR, `sniper-${new Date().toISOString().slice(0, 10)}.log`);

const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m',
    cyan: '\x1b[36m', gray: '\x1b[90m',
};

const TAGC = {
    INFO: C.cyan, OK: C.green, WARN: C.yellow, ERR: C.red,
    SNIPE: C.magenta, MFA: C.blue, STATS: C.cyan,
};

function ts() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function uptime() {
    const s = Math.floor((Date.now() - STATE.startTime) / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function log(tag, msg) {
    const time = ts();
    const color = TAGC[tag] || C.reset;
    console.log(`${C.gray}[${time}]${C.reset} ${color}[${tag.padEnd(5)}]${C.reset} ${msg}`);
    fs.appendFileSync(LOG_FILE, `[${time}] [${tag}] ${msg}\n`, 'utf8');
}

const logger = {
    info: m => log('INFO', m),
    ok: m => log('OK', m),
    warn: m => log('WARN', m),
    err: m => log('ERR', m),
    snipe: m => log('SNIPE', m),
    mfa: m => log('MFA', m),
    stats: () => log('STATS', `Uptime: ${uptime()} | Kontrol: ${STATE.checks} | Snipe: ${STATE.attempts} | Başarılı: ${STATE.success} | RateLimit: ${STATE.rateLimits} | MFA: ${STATE.mfaStatus}`),
    debug: m => { if (CONFIG.DEBUG) log('INFO', '[DBG] ' + m); },
};

// ─────────── UTILS ───────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mask = t => t && t.length > 10 ? t.slice(0, 6) + '...' + t.slice(-4) : '***';

// ─────────── WEBHOOK ───────────
async function webhook(title, desc, color = 0x0099ff) {
    if (!CONFIG.WEBHOOK) return;
    try {
        await axios.post(CONFIG.WEBHOOK, {
            embeds: [{ title, description: desc, color, timestamp: new Date().toISOString(), footer: { text: 'MFA Sniper v2.1' } }],
        });
    } catch (e) {
        logger.debug('Webhook hata: ' + e.message);
    }
}

// ─────────── MFA ───────────
let mfa = null;
let mfaReady = false;
let lastRefresh = 0;

async function initMfa() {
    logger.mfa('MFA başlatılıyor... Token: ' + mask(CONFIG.TOKEN));
    try {
        mfa = initMFA({
            TOKEN: CONFIG.TOKEN,
            PASSWORD: CONFIG.PASSWORD,
            GUILD_IDS: [CONFIG.GUILD_ID],
            log: (t, m) => logger.debug(`[mfa] ${t}: ${m}`),
        });

        const ok = await mfa.refreshMfa();
        if (ok) {
            mfaReady = mfa.canSnipe;
            lastRefresh = Date.now();
            STATE.mfaStatus = 'HAZIR';
            logger.ok(`MFA hazır. Host: ${mfa.host}`);
            return true;
        }
        mfaReady = false;
        STATE.mfaStatus = 'HATA';
        logger.err('MFA alınamadı: ' + (mfa.lastError || 'bilinmeyen'));
        return false;
    } catch (e) {
        mfaReady = false;
        STATE.mfaStatus = 'HATA';
        logger.err('MFA init: ' + e.message);
        return false;
    }
}

async function ensureMfa() {
    if (!mfaReady || (Date.now() - lastRefresh) > 5 * 60 * 1000) {
        logger.mfa('MFA yenileniyor...');
        await initMfa();
    }
}

function getHeaders() {
    if (!mfaReady) return null;
    try {
        if (CONFIG.TWO_FA) {
            return mfa.getTOTPFireHdrs(CONFIG.TWO_FA, 0);
        }
        return mfa.getFireHdrs(0);
    } catch (e) {
        logger.err('Header: ' + e.message);
        mfaReady = false;
        return null;
    }
}

// ─────────── SNIPE ───────────
async function checkVanity() {
    try {
        const res = await axios.get(
            `${CONFIG.API}/guilds/${CONFIG.GUILD_ID}/vanity-url`,
            {
                headers: { 'Authorization': CONFIG.TOKEN, 'User-Agent': CONFIG.UA },
                validateStatus: () => true,
                timeout: 5000,
            }
        );
        return res;
    } catch (e) {
        return { status: -1, data: { error: e.message } };
    }
}

async function attemptSnipe() {
    await ensureMfa();
    const headers = getHeaders();
    if (!headers) {
        logger.warn('Header yok, MFA hazır değil.');
        return false;
    }

    STATE.attempts++;

    try {
        const res = await axios.patch(
            `${CONFIG.API}/guilds/${CONFIG.GUILD_ID}/vanity-url`,
            { code: CONFIG.TARGET_VANITY },
            { headers, validateStatus: () => true, timeout: 5000 }
        );

        if (res.status === 200) {
            STATE.success++;
            logger.ok('═══════════════════════════════════');
            logger.ok('  ✓✓✓ SNIPE BAŞARILI! ✓✓✓');
            logger.ok(`  Vanity: ${CONFIG.TARGET_VANITY}`);
            logger.ok(`  Sunucu: ${CONFIG.GUILD_ID}`);
            logger.ok('═══════════════════════════════════');
            await webhook('🎯 SNIPE BAŞARILI', `Vanity: \`${CONFIG.TARGET_VANITY}\`\nSunucu: \`${CONFIG.GUILD_ID}\``, 0x00ff00);
            return true;
        } else if (res.status === 429) {
            STATE.rateLimits++;
            const wait = (parseFloat(res.headers['retry-after']) || 1) * 1000;
            logger.warn(`Rate limit (${wait}ms)`);
            await sleep(wait);
        } else if (res.status === 401 || res.status === 403) {
            logger.err('Yetki hatası, MFA yenileniyor...');
            mfaReady = false;
            await initMfa();
        } else {
            logger.warn(`Durum ${res.status}: ${JSON.stringify(res.data).slice(0, 150)}`);
        }
    } catch (e) {
        STATE.errors++;
        logger.err('Snipe: ' + e.message);
    }
    return false;
}

// ─────────── MAIN LOOP ───────────
async function tick() {
    STATE.checks++;
    const res = await checkVanity();

    if (res.status === 200 && res.data?.code === CONFIG.TARGET_VANITY) {
        logger.debug('Vanity zaten bizde.');
        return;
    }

    if (res.status === 200 || res.status === 404) {
        logger.snipe(`Tetik! Durum: ${res.status} → snipe`);
        await attemptSnipe();
    } else if (res.status === 429) {
        await sleep(5000);
    }
}

// ─────────── BANNER ───────────
function banner() {
    console.log(C.cyan);
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║      DISCORD MFA SNIPER v2.1                 ║');
    console.log('║      Windows VDS Edition                     ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(C.reset);
}

// ─────────── START ───────────
async function main() {
    const required = ['TOKEN', 'PASSWORD', 'GUILD_ID', 'TARGET_VANITY'];
    const missing = required.filter(k => !CONFIG[k]);
    if (missing.length) {
        console.error(`${C.red}[HATA]${C.reset} Eksik config: ${missing.join(', ')}`);
        console.error(`${C.yellow}İpucu:${C.reset} .env dosyasını doldur.`);
        process.exit(1);
    }

    banner();
    logger.info(`Hedef Vanity : ${CONFIG.TARGET_VANITY}`);
    logger.info(`Sunucu       : ${CONFIG.GUILD_ID}`);
    logger.info(`Kontrol      : ${CONFIG.INTERVAL}ms`);
    logger.info(`Token        : ${mask(CONFIG.TOKEN)}`);
    logger.info('─'.repeat(50));

    await webhook('🟢 Sniper Başlatıldı', `Hedef: \`${CONFIG.TARGET_VANITY}\``, 0x0099ff);
    await initMfa();

    let statTick = 0;

    process.on('SIGINT', () => {
        logger.warn('CTRL+C, çıkılıyor...');
        process.exit(0);
    });

    while (true) {
        try {
            await tick();
        } catch (e) {
            STATE.errors++;
            logger.err('Tick: ' + e.message);
        }

        if (++statTick >= 200) {
            logger.stats();
            statTick = 0;
        }

        await sleep(CONFIG.INTERVAL);
    }
}

process.on('uncaughtException', e => logger.err('Uncaught: ' + e.message));
process.on('unhandledRejection', e => logger.err('Rejection: ' + (e?.message || e)));

main().catch(e => {
    logger.err('Kritik: ' + e.message);
    process.exit(1);
});
