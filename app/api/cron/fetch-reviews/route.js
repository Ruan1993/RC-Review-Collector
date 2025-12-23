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
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&reviews_sort=newest&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK') {
          results.push({ id: docId, status: 'error', error: 'Google API Error', details: data });
          continue;
        }

        const { result } = data;
        
        // --- REFACTOR: Incremental Append Logic ---
        const latestReviews = result.reviews || [];
        const existingReviews = widgetData.reviews || [];
        
        // Filter out duplicates based on author_name and time
        // Note: Google Places API reviews don't always have a stable unique ID, 
        // so we use a composite key of author + time.
        const newReviews = latestReviews.filter(latest => {
          return !existingReviews.some(existing => 
            existing.author_name === latest.author_name && 
            existing.time === latest.time
          );
        });

        let finalReviews = [...existingReviews];

        if (newReviews.length > 0) {
            // Map new reviews to ensure profile_photo_url is present (with fallback)
            // AND process review photos into viewable URLs
            const processedNewReviews = newReviews.map(review => {
                let photoUrls = [];
                if (review.photos && Array.isArray(review.photos)) {
                    photoUrls = review.photos.map(photo => {
                        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${apiKey}`;
                    });
                }

                return {
                    ...review,
                    profile_photo_url: review.profile_photo_url || null,
                    photos: photoUrls // Store array of valid image URLs
                };
            });

            // Add new reviews to the list
            finalReviews = [...finalReviews, ...processedNewReviews];
            
            // Sort by time (newest first)
            finalReviews.sort((a, b) => b.time - a.time);
            
            console.log(`[${docId}] Added ${processedNewReviews.length} new reviews. Total: ${finalReviews.length}`);
        } else {
            console.log(`[${docId}] No new reviews found. Keeping existing ${existingReviews.length}.`);
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
