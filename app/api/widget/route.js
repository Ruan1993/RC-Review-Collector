import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // Get the widget ID from the URL query parameter (default to 'default-widget')
    const { searchParams } = new URL(request.url);
    const widgetId = searchParams.get('id') || 'default-widget';

    const docRef = doc(db, 'widgets', widgetId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Widget data not found' }, { status: 404 });
    }

    const data = docSnap.data();

    // Convert Firestore Timestamp to ISO string if needed
    if (data.lastUpdated && typeof data.lastUpdated.toDate === 'function') {
        data.lastUpdated = data.lastUpdated.toDate().toISOString();
    }

    const response = NextResponse.json(data);

    // Set CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;
  } catch (error) {
    console.error('Error serving widget data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  const response = NextResponse.json({});
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
