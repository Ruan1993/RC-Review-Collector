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
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK') {
          results.push({ id: docId, status: 'error', error: 'Google API Error', details: data });
          continue;
        }

        const { result } = data;
        
        // Prepare update data
        const updateData = {
          reviews: result.reviews || [],
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
          reviewCount: (result.reviews || []).length
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
