import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const placeId = process.env.GOOGLE_PLACE_ID;

    if (!apiKey || !placeId) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return NextResponse.json({ error: 'Failed to fetch from Google Maps API', details: data }, { status: 500 });
    }

    const { result } = data;
    const widgetData = {
      reviews: result.reviews || [],
      rating: result.rating || 0,
      user_ratings_total: result.user_ratings_total || 0,
      lastUpdated: serverTimestamp(),
    };

    // Save to Firestore
    await setDoc(doc(db, 'widgets', 'default-widget'), widgetData);

    return NextResponse.json({ success: true, data: widgetData });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}