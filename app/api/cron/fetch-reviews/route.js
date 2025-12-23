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

    for (const docSnap of snapshot.docs) {
      const widgetData = docSnap.data();
      const placeId = widgetData.placeId;
      const docId = docSnap.id;

      if (!placeId) {
        results.push({ id: docId, status: 'skipped', reason: 'No placeId found in document' });
        continue;
      }

      try {
        // --- SWITCH TO NEW PLACES API (v1) ---
        const url = `https://places.googleapis.com/v1/places/${placeId}`;
        
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'reviews,rating,userRatingCount,displayName'
            }
        });
        
        const data = await response.json();

        // LOGGING: Check raw data from Google
        console.log(`[${docId}] Raw Google Response:`, JSON.stringify(data));

        if (data.error) {
          results.push({ id: docId, status: 'error', error: 'Google API Error', details: data.error });
          continue;
        }

        // --- FORCE EXECUTION RUN ---
        // 1. Hard-code empty array (ignoring DB)
        const existingReviews = []; 
        
        // 2. Get latest from Google (New API structure)
        const latestReviews = data.reviews || [];
        
        // 3. No ID check / Duplicate check - Take EVERYTHING from Google
        const newReviews = latestReviews;

        let finalReviews = [...existingReviews];

        if (newReviews.length > 0) {
            // Map new reviews to match existing schema
            const processedNewReviews = newReviews.map(review => {
                
                let photoUrls = [];
                if (review.photos && Array.isArray(review.photos)) {
                    photoUrls = review.photos.map(photo => {
                        // New API returns resource name like "places/PLACE_ID/photos/PHOTO_ID"
                        // URL format: https://places.googleapis.com/v1/{name}/media
                        return `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`;
                    });
                }

                // Map New API fields to Legacy schema
                return {
                    author_name: review.authorAttribution?.displayName,
                    author_url: review.authorAttribution?.uri,
                    profile_photo_url: review.authorAttribution?.photoUri || null,
                    rating: review.rating,
                    text: review.text?.text || review.originalText?.text || "",
                    time: review.publishTime ? new Date(review.publishTime).getTime() / 1000 : Date.now() / 1000, // Convert ISO to Unix timestamp
                    relative_time_description: review.relativePublishTimeDescription,
                    photos: photoUrls // Store array of valid image URLs
                };
            });

            // Add new reviews to the list
            finalReviews = [...finalReviews, ...processedNewReviews];
            
            // Sort by time (newest first)
            finalReviews.sort((a, b) => b.time - a.time);
            
            console.log(`[${docId}] Force Overwrite: Saving ${processedNewReviews.length} reviews.`);
        } else {
            console.log(`[${docId}] No new reviews found in Google response.`);
        }

        // Prepare update data
        const updateData = {
          reviews: finalReviews, // Save the combined list
          rating: data.rating || 0,
          user_ratings_total: data.userRatingCount || 0, // Note: userRatingCount in New API vs user_ratings_total in Legacy
          lastUpdated: serverTimestamp(),
        };

        // Update the specific document
        await updateDoc(doc(db, 'widgets', docId), updateData);
        
        results.push({ 
          id: docId, 
          status: 'success', 
          placeId: placeId,
          rating: data.rating,
          reviewCount: finalReviews.length,
          newAdded: newReviews.length
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
