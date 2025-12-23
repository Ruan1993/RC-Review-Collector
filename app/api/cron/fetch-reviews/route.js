import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const OUTSCRAPER_API_KEY = 'NGQ0MzQ4YjFmZTdjNDE5NjhkNzA3ZjJlNzQ0YTk5MDF8NDZjYWEyM2FmNg';

export async function GET() {
  try {
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
        console.log(`[${docId}] Fetching reviews from Outscraper for Place ID: ${placeId}`);

        // --- OUTSCRAPER API ---
        // Fetch up to 50 reviews for Wilma (to restore history), fewer for others to save quota
        // Sort by newest to get the latest ones first
        let limit = 10;
        if (placeId === 'ChIJq1eirq_B1h0R9CiBHeqE2vQ') {
            limit = 50; // Full restore for this specific client
        }

        const outscraperUrl = `https://api.app.outscraper.com/maps/reviews-v3?query=${placeId}&reviewsLimit=${limit}&sort=newest&async=false&api_key=${OUTSCRAPER_API_KEY}`;
        
        const response = await fetch(outscraperUrl);
        const jsonResponse = await response.json();

        if (jsonResponse.status && jsonResponse.status !== 'Success' && jsonResponse.data === undefined) {
             throw new Error(`Outscraper Error: ${jsonResponse.message || 'Unknown error'}`);
        }

        // Outscraper returns an array of results (one per query)
        // We queried one Place ID, so we take the first item
        const placeData = jsonResponse.data && jsonResponse.data[0];
        
        if (!placeData) {
             throw new Error('No data returned from Outscraper');
        }

        const latestReviews = placeData.reviews_data || [];
        
        // --- VAULT LOGIC (MERGE: TRUE) ---
        // 1. Get existing reviews from Firestore
        const existingReviews = widgetData.reviews || []; 
        
        // 2. Create a Map of existing reviews for quick lookup to prevent duplicates
        const existingMap = new Map();
        existingReviews.forEach(r => {
            // Use time + author as a unique composite key
            // Note: Outscraper returns timestamp in seconds (review_timestamp)
            const key = `${r.time}_${r.author_name}`;
            existingMap.set(key, r);
        });

        const newReviewsToAdd = [];

        // 3. Process fetched reviews
        for (const review of latestReviews) {
            const timestamp = review.review_timestamp; // Unix timestamp (seconds)
            const authorName = review.author_title;
            const key = `${timestamp}_${authorName}`;

            // SKIP if already exists in our "Vault" (Do NOT overwrite)
            if (existingMap.has(key)) {
                continue;
            }

            // Map Outscraper fields to our Schema
            const photos = [];
            if (review.review_img_url) {
                photos.push(review.review_img_url);
            }

            const newReview = {
                author_name: review.author_title,
                author_url: review.author_link,
                profile_photo_url: review.author_image || null,
                rating: review.review_rating,
                text: review.review_text || "",
                time: review.review_timestamp, 
                // Outscraper doesn't give "2 weeks ago", but we can compute it or leave blank.
                // For now, we leave it as the date string provided or null.
                relative_time_description: review.review_datetime_utc, 
                photos: photos // Mapped from review_img_url
            };
            
            newReviewsToAdd.push(newReview);
        }

        // 4. Merge & Sort
        let finalReviews = [...existingReviews, ...newReviewsToAdd];
        finalReviews.sort((a, b) => b.time - a.time);
        
        console.log(`[${docId}] Vault Status: Found ${latestReviews.length} from Outscraper. Added ${newReviewsToAdd.length} new. Total in Vault: ${finalReviews.length}`);

        // Prepare update data
        const updateData = {
          reviews: finalReviews, 
          // Use Outscraper's rating/count if available, else keep existing
          rating: placeData.rating || widgetData.rating || 0,
          user_ratings_total: placeData.reviews || widgetData.user_ratings_total || 0,
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
