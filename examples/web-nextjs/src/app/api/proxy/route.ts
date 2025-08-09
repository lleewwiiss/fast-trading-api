import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, headers = {}, method = 'GET', body: requestBody } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Make the request server-side (no CORS issues)
    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    };

    if (requestBody && method !== 'GET') {
      fetchOptions.body = typeof requestBody === 'string' 
        ? requestBody 
        : JSON.stringify(requestBody);
    }

    const response = await fetch(url, fetchOptions);
    
    // Get response text first to handle both JSON and non-JSON responses
    const responseText = await response.text();
    
    // Try to parse as JSON, fallback to text
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    // Return the response with proper headers
    return NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Proxy request failed' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}