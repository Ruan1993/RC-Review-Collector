import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GOOGLE_API_KEY' }, { status: 500 });
    }

    const widgetsRef = collection(db, 'widgets');
    const snapshot = await getDocs(widgetsRef);
    
    const results = [];

    // Loop through each widget in the database
    for (const docSnap of snapshot.docs) {
      const widgetData = docSnap.data();
      const placeId = widgetData.placeId;
      const docId = docSnap.id;

      if (!placeId) {
        results.push({ id: docId, status: 'skipped', reason: 'No placeId found in document' });
        continue;
      }

      try {
        console.log(`[${docId}] Fetching reviews from Google (Legacy) for Place ID: ${placeId}`);

        // --- GOOGLE PLACES API (LEGACY) ---
        // Fetch 5 reviews, sorting by newest to capture recent ones
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&reviews_sort=newest&key=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK') {
          results.push({ id: docId, status: 'error', error: 'Google API Error', details: data });
          continue;
        }

        const { result } = data;
        const latestReviews = result.reviews || [];

        // --- VAULT LOGIC (MERGE: TRUE) ---
        // 1. Get existing reviews from Firestore
        const existingReviews = widgetData.reviews || []; 
        
        // 2. Create a Map of existing reviews for quick lookup to prevent duplicates
        const existingMap = new Map();
        existingReviews.forEach(r => {
            // Use time + author as a unique composite key
            const key = `${r.time}_${r.author_name}`;
            existingMap.set(key, r);
        });

        const newReviewsToAdd = [];

        // 3. Process fetched reviews (Legacy API returns 5 max)
        for (const review of latestReviews) {
            const timestamp = review.time;
            const authorName = review.author_name;
            const key = `${timestamp}_${authorName}`;

            // SKIP if already exists in our "Vault" (Do NOT overwrite)
            if (existingMap.has(key)) {
                continue;
            }

            // Map Google API fields to our Schema
            const newReview = {
                author_name: review.author_name,
                author_url: review.author_url,
                profile_photo_url: review.profile_photo_url || null,
                rating: review.rating,
                text: review.text || "",
                time: review.time, 
                relative_time_description: review.relative_time_description,
                photos: [] // Text-Only Mode: We do not fetch/save photos from Google
            };
            
            newReviewsToAdd.push(newReview);
        }

        // 4. Merge & Sort
        let finalReviews = [...existingReviews, ...newReviewsToAdd];
        finalReviews.sort((a, b) => b.time - a.time);
        
        console.log(`[${docId}] Vault Status: Found ${latestReviews.length} from Google. Added ${newReviewsToAdd.length} new. Total in Vault: ${finalReviews.length}`);

        // Prepare update data
        const updateData = {
          reviews: finalReviews, 
          rating: result.rating || widgetData.rating || 0,
          user_ratings_total: result.user_ratings_total || widgetData.user_ratings_total || 0,
          lastUpdated: serverTimestamp(),
        };

        // Update the specific document
        await updateDoc(doc(db, 'widgets', docId), updateData);
        
        results.push({ 
          id: docId, 
          status: 'success', 
          placeId: placeId,
          rating: updateData.rating,
          reviewCount: finalReviews.length,
          newAdded: newReviewsToAdd.length
        });

      } catch (err) {
        console.error(`Error processing widget ${docId}:`, err);
        results.push({ id: docId, status: 'error', error: err.message });
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      results 
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
