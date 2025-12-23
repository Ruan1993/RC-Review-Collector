import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const OUTSCRAPER_API_KEY = 'NGQ0MzQ4YjFmZTdjNDE5NjhkNzA3ZjJlNzQ0YTk5MDF8NDZjYWEyM2FmNg';

    if (!OUTSCRAPER_API_KEY) {
      return NextResponse.json({ error: 'Missing Outscraper API Key' }, { status: 500 });
    }

    const widgetsRef = collection(db, 'widgets');
    const snapshot = await getDocs(widgetsRef);
    
    const results = [];

    for (const docSnap of snapshot.docs) {
      const widgetData = docSnap.data();
      const placeId = widgetData.placeId;
      const docId = docSnap.id;

      if (!placeId) {
        results.push({ id: docId, status: 'skipped', reason: 'No placeId found in document' });
        continue;
      }

      try {
        // --- SWITCH TO OUTSCRAPER API ---
        // Using Outscraper to get full review history + photos
        console.log(`[${docId}] Fetching reviews from Outscraper for Place ID: ${placeId}`);
        
        const url = `https://api.app.outscraper.com/maps/reviews-v3?query=${placeId}&reviewsLimit=50&async=false&apiKey=${OUTSCRAPER_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();

        // LOGGING: Check raw data from Outscraper
        // console.log(`[${docId}] Raw Outscraper Response:`, JSON.stringify(data));

        if (!data || !data.data || data.data.length === 0) {
           results.push({ id: docId, status: 'error', error: 'Outscraper returned no data' });
           continue;
        }

        // Outscraper returns an array of results (one per query)
        const placeData = data.data[0];
        const latestReviews = placeData.reviews_data || [];
        
        // --- HYBRID VAULT LOGIC (MERGE) ---
        // 1. Get existing reviews from Firestore
        const existingReviews = widgetData.reviews || []; 
        
        // 2. Create a Map of existing reviews for quick lookup (by review_id if available, or timestamp+author)
        // We use a composite key: google_id (if available) OR timestamp + author_name
        const existingMap = new Map();
        existingReviews.forEach(r => {
            const key = r.google_id || `${r.time}_${r.author_name}`;
            existingMap.set(key, r);
        });

        const newReviewsToAdd = [];

        // 3. Process fetched reviews
        for (const review of latestReviews) {
            // Outscraper fields mapping
            const googleId = review.google_id || review.review_id; // Check available ID fields
            const timestamp = review.review_timestamp;
            const authorName = review.author_title;
            
            // Generate Key
            const key = googleId || `${timestamp}_${authorName}`;

            // Check if exists
            if (existingMap.has(key)) {
                // SKIP - Do not overwrite existing reviews (protects manual edits)
                continue;
            }

            // Map Outscraper fields to our schema
            let photoUrls = [];
            if (review.review_img_url) {
                // Outscraper usually returns a single string or null? 
                // Documentation says string (url). If multiple, maybe comma separated? 
                // Assuming string for now, verifying if it's a valid URL.
                if (typeof review.review_img_url === 'string' && review.review_img_url.length > 0) {
                     photoUrls = [review.review_img_url];
                } else if (Array.isArray(review.review_img_url)) {
                     photoUrls = review.review_img_url;
                }
            }

            const newReview = {
                google_id: googleId || null,
                author_name: review.author_title,
                author_url: review.author_link,
                profile_photo_url: review.author_image || null,
                rating: review.review_rating,
                text: review.review_text || "",
                time: review.review_timestamp, // Unix timestamp
                relative_time_description: review.review_datetime_utc, // or similar
                photos: photoUrls 
            };
            
            newReviewsToAdd.push(newReview);
        }

        // 4. Merge
        let finalReviews = [...existingReviews, ...newReviewsToAdd];

        // 5. Sort by time (newest first)
        finalReviews.sort((a, b) => b.time - a.time);
        
        console.log(`[${docId}] Merged ${newReviewsToAdd.length} new reviews. Total: ${finalReviews.length}`);

        // Prepare update data
        const updateData = {
          reviews: finalReviews, 
          rating: placeData.rating || 0,
          user_ratings_total: placeData.reviews || 0,
          lastUpdated: serverTimestamp(),
        };

        // Update the specific document
        await updateDoc(doc(db, 'widgets', docId), updateData);
        
        results.push({ 
          id: docId, 
          status: 'success', 
          placeId: placeId,
          rating: placeData.rating,
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
