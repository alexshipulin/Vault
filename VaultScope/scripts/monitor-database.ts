import { initializeAdmin } from "./firebase-admin-runtime";

const CATEGORIES = ["furniture", "ceramics", "art", "jewelry", "general"] as const;
const PRICE_BUCKETS = [
  { label: "under_100", min: null, max: 100 },
  { label: "100_to_500", min: 100, max: 500 },
  { label: "500_to_1000", min: 500, max: 1000 },
  { label: "1000_to_5000", min: 1000, max: 5000 },
  { label: "above_5000", min: 5000, max: null }
] as const;

async function monitorDatabase() {
  const { db, projectId } = initializeAdmin();
  const auctions = db.collection("antique_auctions");

  console.log(`Monitoring Firestore project: ${projectId}`);

  const totalCount = (await auctions.count().get()).data().count;
  console.log(`✅ Total documents: ${totalCount}`);

  const latestSnapshot = await auctions.orderBy("updatedAt", "desc").limit(1).get();
  if (!latestSnapshot.empty) {
    const latest = latestSnapshot.docs[0]?.data();
    console.log(`✅ Latest update: ${String(latest?.updatedAt ?? "unknown")}`);
  } else {
    console.log("⚠️ No documents found in antique_auctions");
  }

  console.log("Category distribution:");
  for (const category of CATEGORIES) {
    const count = (await auctions.where("category", "==", category).count().get()).data().count;
    console.log(`  - ${category}: ${count}`);
  }

  console.log("Price range distribution:");
  for (const bucket of PRICE_BUCKETS) {
    let query = auctions;

    if (bucket.min !== null) {
      query = query.where("priceRealized", ">=", bucket.min);
    }

    if (bucket.max !== null) {
      query = query.where("priceRealized", "<", bucket.max);
    }

    const count = (await query.count().get()).data().count;
    console.log(`  - ${bucket.label}: ${count}`);
  }
}

monitorDatabase().catch((error) => {
  console.error("❌ monitor-database failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
