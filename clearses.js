// clear-sessions.js
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in .env file");
  process.exit(1);
}

async function clearSessions() {
  console.log("🔧 Connecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db("ayobot");

    // Clear auth states
    const authResult = await db.collection("auth_states").deleteMany({});
    console.log(`✅ Cleared ${authResult.deletedCount} auth states`);

    // Clear session meta
    const metaResult = await db.collection("session_meta").deleteMany({});
    console.log(`✅ Cleared ${metaResult.deletedCount} session metas`);

    // Clear user logs (optional)
    // await db.collection("user_log").deleteMany({});
    // console.log("✅ Cleared user logs");

    console.log("\n🎉 All sessions cleared! Now restart your bot.");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await client.close();
  }
}

clearSessions();
