const { exec } = require('child_process')
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const Redis = require('ioredis');


const publisher = new Redis(process.env.REDIS_URL);

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID;

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

async function init() {
    console.log("executing script.js")
    publishLog('Build started...')
    const outDirPath = path.join(__dirname, "output");
    const command = exec(`cd ${outDirPath} && npm install && npm run build`)

    command.stdout.on('data', function (data) {
        console.log(data.toString());
        publishLog(data.toString())
    });

    command.stdout.on('error', function (data) {
        console.log(`Error: ${data.toString()}`);
        publishLog(`Error: ${data.toString()}`)
    });

    command.on('close', async function () {
        console.log(`Build Completed`);
        publishLog(`Build Completed`)
        const distFolderPath = path.join(__dirname, "output", "dist");
        const distFolderContent = fs.readdirSync(distFolderPath, { recursive: true });

        publishLog('starting uploading files')
        for (const file of distFolderContent) {
            const filePath = path.join(distFolderPath, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log(`Uploading... ${filePath}`);
            publishLog(`Uploading... ${filePath}`);

            const command = new PutObjectCommand({
                Bucket: 'vercel-clone-build-assets',
                Key: `__output/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })

            await s3Client.send(command);
            publishLog(`Uploaded ${filePath}`);

            console.log(`Uploaded ${filePath}`);
        }
        publishLog('DONE');
    });
}

init();