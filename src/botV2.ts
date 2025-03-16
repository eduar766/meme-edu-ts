import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';
import { config } from 'dotenv';
import snoowrap from 'snoowrap';
import axios from 'axios';

config(); // Cargar variables de entorno desde .env

// Configuración del bot de Discord
const TOKEN = process.env.DISCORD_TOKEN;
const INTERVALO = Number(process.env.INTERVALO_PUBLICACION) || 10; // Intervalo en minutos
const SUBREDDITS = ['gamingmemes', 'dankmemes', 'ProgrammerHumor', 'techhumor'];
let lastMemeUrls: string[] = []; // Almacena las últimas 10 imágenes publicadas
const preferredChannelNames = ['memes', 'random', 'fun', 'general']; // Prioridad de nombres de canal

// Obtener un access_token usando username/password sin codificación en Base64
async function getRedditAccessToken() {
    try {
        const response = await axios.post(
            'https://www.reddit.com/api/v1/access_token',
            new URLSearchParams({
                grant_type: 'password',
                username: process.env.REDDIT_USERNAME!,
                password: process.env.REDDIT_PASSWORD!
            }),
            {
                auth: {
                    username: process.env.REDDIT_CLIENT_ID!,
                    password: process.env.REDDIT_CLIENT_SECRET!
                },
                headers: {
                    'User-Agent': process.env.REDDIT_USER_AGENT || 'discord-meme-bot',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error("❌ Error obteniendo el token de acceso de Reddit:", error.response?.data || error);
        return process.env.REDDIT_REFRESH_TOKEN;
    }
}

let reddit: snoowrap | null = null;

async function authenticateReddit() {
    const accessToken = await getRedditAccessToken();
    if (!accessToken) {
        console.error("❌ No se pudo autenticar en Reddit");
        return;
    }
    reddit = new snoowrap({
        userAgent: process.env.REDDIT_USER_AGENT || 'discord-meme-bot',
        clientId: process.env.REDDIT_CLIENT_ID,
        clientSecret: process.env.REDDIT_CLIENT_SECRET,
        accessToken: accessToken
    });
    console.log("🔑 Reddit autenticado correctamente");
}

// Inicializar el bot de Discord
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user?.tag}`);
    console.log(`🔍 Servidores en los que está:`);
    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (ID: ${guild.id})`);
    });
    await authenticateReddit();
    enviarMemeATodosLosServidores();
});

// Función para obtener un canal adecuado en cada servidor
async function getBestChannel(guild: any): Promise<TextChannel | null> {
    const channels = guild.channels.cache.filter((channel: any) =>
        channel.type === 0 && channel.permissionsFor(guild.members.me).has("SendMessages")
    );
    
    for (const name of preferredChannelNames) {
        const foundChannel = channels.find((c: any) => c.name.includes(name));
        if (foundChannel) return foundChannel;
    }
    
    return channels.first() || null;
}

// Función para enviar memes a todos los servidores donde está el bot
async function enviarMemeATodosLosServidores() {
    client.guilds.cache.forEach(async (guild) => {
        const channel = await getBestChannel(guild);
        if (channel) {
            console.log(`📤 Enviando meme a #${channel.name} en ${guild.name}`);
            await enviarMeme(channel);
        } else {
            console.warn(`⚠️ No se encontró un canal adecuado en ${guild.name}`);
        }
    });
}

// Función para obtener un meme aleatorio de Reddit sin repetir los últimos 10 enviados
async function fetchMeme(): Promise<{ title: string; url: string } | null> {
    if (!reddit) {
        console.error("❌ Reddit no está autenticado aún");
        return null;
    }
    try {
        const subreddit = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
        console.log(`Obteniendo memes de r/${subreddit}...`);
        
        const posts = await reddit.getSubreddit(subreddit).getHot({ limit: 50 });
        let images = posts.filter(post => !post.stickied && (post.url.endsWith('.jpg') || post.url.endsWith('.png')));
        
        if (images.length === 0) {
            console.log("No se encontraron imágenes válidas en este momento.");
            return null;
        }
        
        images = images.sort(() => Math.random() - 0.5);
        let meme = images.find(post => !lastMemeUrls.includes(post.url));
        if (!meme) {
            meme = images[0];
        }
        
        lastMemeUrls.push(meme.url);
        if (lastMemeUrls.length > 10) {
            lastMemeUrls.shift();
        }
        
        console.log("Últimos 10 memes enviados:", lastMemeUrls);
        return { title: meme.title, url: meme.url };
    } catch (error) {
        console.error("Error al obtener el meme:", error);
        return null;
    }
}

// Función para enviar un meme a un canal específico
async function enviarMeme(channel: TextChannel): Promise<void> {
    const meme = await fetchMeme();
    if (meme) {
        const embed = new EmbedBuilder()
            .setTitle(meme.title)
            .setImage(meme.url)
            .setColor(0x0099ff);
        await channel.send({ embeds: [embed] });
    } else {
        console.log("⚠️ No se pudo obtener un meme en este momento.");
    }
}

// Comando para obtener un meme manualmente
client.on('messageCreate', async (message) => {
    if (message.content === '!meme' && message.channel instanceof TextChannel) {
        await enviarMeme(message.channel);
    }
});

// Iniciar el bot
client.login(TOKEN);
