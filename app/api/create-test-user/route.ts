import { auth } from "@/lib/auth";
import { Pool } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const db = auth.options.database as Pool;
    
    // Generate a UUID for the user
    const userId = crypto.randomUUID();
    
    // Create the test user
    const result = await db.query(
      `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, NOW(), NOW()) 
       ON CONFLICT (email) DO UPDATE 
       SET name = EXCLUDED.name, "updatedAt" = NOW()
       RETURNING *`,
      [userId, 'lvickery@asi.co.nz', 'Test User', true]
    );
    
    return NextResponse.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating test user:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}