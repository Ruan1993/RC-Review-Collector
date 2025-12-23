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
        // --- SWITCH BACK TO LEGACY PLACES API ---
        // Reason: V1 API has known restriction/bug omitting photos for some keys.
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        // LOGGING: Check raw data from Google
        console.log(`[${docId}] Raw Google Response:`, JSON.stringify(data));

        if (data.status !== 'OK') {
          results.push({ id: docId, status: 'error', error: 'Google API Error', details: data });
          continue;
        }

        const { result } = data;
        
        // --- FORCE EXECUTION RUN (HARD OVERWRITE) ---
        // 1. Hard-code empty array (ignoring DB) to ensure we overwrite everything
        const existingReviews = []; 
        
        // 2. Get latest from Google (Legacy API structure)
        const latestReviews = result.reviews || [];
        
        // 3. No ID check / Duplicate check - Take EVERYTHING from Google
        const newReviews = latestReviews;

        let finalReviews = [...existingReviews];

        if (newReviews.length > 0) {
            // Map new reviews to match existing schema
            const processedNewReviews = newReviews.map(review => {
                
                let photoUrls = [];
                // Check for photos array in the review object (Legacy API)
                if (review.photos && Array.isArray(review.photos)) {
                    photoUrls = review.photos.map(photo => {
                        // Legacy API returns photo_reference
                        // URL format: https://maps.googleapis.com/maps/api/place/photo
                        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${apiKey}`;
                    });
                }

                return {
                    ...review,
                    profile_photo_url: review.profile_photo_url || null,
                    photos: photoUrls || [] // Store array of valid image URLs
                };
            });

            // Add new reviews to the list
            finalReviews = [...finalReviews, ...processedNewReviews];
            
            // Sort by time (newest first)
            finalReviews.sort((a, b) => b.time - a.time);
            
            console.log(`[${docId}] Overwrote ${processedNewReviews.length} reviews (Force Refresh via Legacy API).`);
        } else {
            console.log(`[${docId}] No new reviews found in Google response.`);
        }

        // Prepare update data
        const updateData = {
          reviews: finalReviews, // Save the combined list
          rating: result.rating || 0,
          user_ratings_total: result.user_ratings_total || 0,
          lastUpdated: serverTimestamp(),
        };

        // Update the specific document
        await updateDoc(doc(db, 'widgets', docId), updateData);
        
        results.push({ 
          id: docId, 
          status: 'success', 
          placeId: placeId,
          rating: result.rating,
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
