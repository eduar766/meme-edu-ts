import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';
import * as dotenv from 'dotenv';
import snoowrap from 'snoowrap';
import axios from 'axios';

dotenv.config(); // Cargar variables de entorno desde .env

console.log(dotenv.config())

// Configuración del bot de Discord
const TOKEN = process.env.DS_TOKEN;
console.log('TOKEN1', TOKEN)
const CHANNEL_ID = process.env.DS_CHANNEL_ID;
const INTERVALO = Number(process.env.INTERVALO_PUBLICACION) || 10; // Intervalo en minutos
//const SUBREDDITS = ['gamingmemes', 'dankmemes', 'ProgrammerHumor', 'techhumor'];
//const SUBREDDITS = ['ArianaGrande'];
const SUBREDDITS = ['SpanishMeme', 'MemesLatinoamerica', '2latinoforyou', 'memes', 'gamingmemes', 'ProgrammerHumor'];
let lastMemeUrls: string[] = []; // Almacena las últimas 10 imágenes publicadas

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
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error("❌ Error obteniendo el token de acceso de Reddit:");
        return 'eyJhbGciOiJSUzI1NiIsImtpZCI6IlNIQTI1NjpzS3dsMnlsV0VtMjVmcXhwTU40cWY4MXE2OWFFdWFyMnpLMUdhVGxjdWNZIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNzQyMjI5NzAwLjU3MjEwOSwiaWF0IjoxNzQyMTQzMzAwLjU3MjEwOSwianRpIjoiY3BOdE9MMWxwMkd5dGtOc05PUXh4WXpMQkJCem1nIiwiY2lkIjoiTjlTM1VXVXBYZkZKZ2FPT25WeXR5dyIsImxpZCI6InQyXzh2bnJzeXJrIiwiYWlkIjoidDJfOHZucnN5cmsiLCJsY2EiOjE2MDUzMDQ1NDcwMDAsInNjcCI6ImVKeUtWdEpTaWdVRUFBRF9fd056QVNjIiwiZmxvIjo5fQ.TedbT8v24AaDuODMCRpdRPWicSaPGCEiwOHpBRcp5ws_FW_xMqlXJkODChWmdfRDkeMX4fTyBBRi8dZO9a4TCR5XPK9yfp8URluFlPKdDgBN1BFwFgL5xJnlIsqvclZTBh6-2EnUxhfjcMLukkyWpVzhyOoVWgnvy4kPH15tDN8RT-sQ2EG5doMbrQEgbTLO7lYvsoVrzim2T3is6pDz-EqNmJFbjhK1x_wzDoKg7Sr_eMQH9uaP-EVp227jw1Zr9z6AfASDTi6cVKA426CyN3j87SHUbduttZdnMdhZ8gTmkp747KfByD0QkvoEA6gua6vz98sgVJv0Bo_z5ygTGg'
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
});

// Función para obtener un meme aleatorio de Reddit
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
        
        // Barajar los resultados para mayor variabilidad
        images = images.sort(() => Math.random() - 0.5);
        
        // Seleccionar un meme que no esté en la lista de los últimos 10 enviados
        let meme = images.find(post => !lastMemeUrls.includes(post.url));
        if (!meme) {
            meme = images[0]; // Si todos los memes son repetidos, usa el primero
        }
        
        // Agregar el nuevo meme y asegurar que la lista no tenga más de 10 elementos
        lastMemeUrls.push(meme.url);
        if (lastMemeUrls.length > 10) {
            lastMemeUrls.shift(); // Eliminar el más antiguo
        }
        
        console.log("Últimos 10 memes enviados:", lastMemeUrls);
        console.log(`Meme seleccionado: ${meme.title} (${meme.url})`);
        return { title: meme.title, url: meme.url };
    } catch (error) {
        console.error("Error al obtener el meme:", error);
        return null;
    }
}


// Función para enviar un meme al canal
async function enviarMeme(): Promise<void> {
    console.log(`🔍 Buscando canal con ID: ${CHANNEL_ID}`);

    console.log("📡 Canales disponibles:", client.channels.cache.map(c => `${c.id} (${c.type})`).join(", "));

    const channel = await client.channels.fetch(`${CHANNEL_ID}`) as TextChannel;
    
    if (!channel) {
        console.error("❌ No se encontró el canal. Verifica que el bot tenga permisos y que el ID sea correcto.");
        return;
    }

    console.log(`✅ Canal encontrado: ${channel.name}`);

    const meme = await fetchMeme();
    if (meme) {
        const embed = new EmbedBuilder()
            .setTitle(meme.title)
            .setImage(meme.url)
            .setColor(0x0099ff);

        await channel.send({ embeds: [embed] });
        console.log(`📤 Meme enviado a #${channel.name}`);
    } else {
        console.log("⚠️ No se pudo obtener un meme en este momento.");
    }
}

// Ejecutar la publicación de memes en intervalos regulares
client.once('ready', async () => {
    console.log(`${client.user?.tag} ha iniciado sesión`);
    enviarMeme();
    setInterval(enviarMeme, INTERVALO * 60 * 1000); // Convertir a milisegundos
});

// Comando para obtener un meme manualmente
client.on('messageCreate', async (message) => {
    if (message.content === '!meme' && message.channel instanceof TextChannel) {
        const meme = await fetchMeme();
        if (meme) {
            const embed = new EmbedBuilder()
                .setTitle(meme.title)
                .setImage(meme.url)
                .setColor(0x00ff00);
            await message.channel.send({ embeds: [embed] });
        } else {
            await message.channel.send("No se encontró un meme en este momento. Intenta más tarde.");
        }
    }
});

// Iniciar el bot
console.log('TOKEN2', TOKEN)
client.login(TOKEN);
