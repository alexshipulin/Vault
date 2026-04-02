import { initializeAdmin } from "./firebase-admin-runtime";

async function verify() {
  const { db, projectId } = initializeAdmin();

  console.log(`🔎 Verifying Firestore project: ${projectId}`);

  const snapshot = await db.collection("antique_auctions").limit(10).get();

  if (snapshot.empty) {
    console.log("❌ antique_auctions collection is empty");
    process.exit(1);
  }

  console.log(`✅ Found ${snapshot.size} items in antique_auctions`);

  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`  - ${String(data.title ?? "Untitled")} ($${String(data.priceRealized ?? "n/a")})`);
  });

  await db
    .collection("antique_auctions")
    .where("keywords", "array-contains-any", ["antique"])
    .limit(1)
    .get();

  console.log("✅ Keyword search index working");

  await db
    .collection("antique_auctions")
    .where("category", "==", "furniture")
    .limit(1)
    .get();

  console.log("✅ Category index working");
}

verify().catch((error) => {
  console.error(error);
  process.exit(1);
});
