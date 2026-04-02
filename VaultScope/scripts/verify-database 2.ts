import { initializeAdmin } from "./firebase-admin-runtime";

async function verifyDatabase() {
  const { db, projectId } = initializeAdmin();

  console.log(`Verifying Firestore project: ${projectId}`);

  const sampleSnapshot = await db.collection("antique_auctions").limit(10).get();
  console.log(`✅ Found ${sampleSnapshot.size} sample items in antique_auctions`);

  sampleSnapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`  - ${String(data.title ?? "Untitled")} ($${String(data.priceRealized ?? "n/a")})`);
  });

  const categorySnapshot = await db
    .collection("antique_auctions")
    .where("category", "==", "furniture")
    .limit(1)
    .get();

  console.log(
    categorySnapshot.empty
      ? "⚠️ Category query returned no furniture sample."
      : "✅ Category filtering query executed successfully"
  );

  const keywordSnapshot = await db
    .collection("antique_auctions")
    .where("keywords", "array-contains-any", ["antique", "vintage"])
    .limit(1)
    .get();

  console.log(
    keywordSnapshot.empty
      ? "⚠️ Keyword query returned no sample matches."
      : "✅ Keyword search query executed successfully"
  );

  const priceRangeSnapshot = await db
    .collection("antique_auctions")
    .where("priceRealized", ">=", 100)
    .where("priceRealized", "<=", 1000)
    .limit(1)
    .get();

  console.log(
    priceRangeSnapshot.empty
      ? "⚠️ Price range query returned no sample matches."
      : "✅ Price range filtering query executed successfully"
  );

  const countSnapshot = await db.collection("antique_auctions").count().get();
  const totalCount = countSnapshot.data().count;
  console.log(`ℹ️ Total antique_auctions documents: ${totalCount}`);

  if (totalCount < 1000) {
    console.warn("⚠️ Collection has fewer than 1000 items. Production ingestion may still be incomplete.");
  }
}

verifyDatabase().catch((error) => {
  console.error("❌ verify-database failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
