import { Spire } from "./Spire";
import { loadEnv } from "./utils/loadEnv";

async function main() {
    // load the environment variables
    loadEnv();
    const server = new Spire({
        dbType: process.env.DB_TYPE as any,
        logLevel: "info",
    });
}

main();
