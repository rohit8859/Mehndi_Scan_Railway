export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/db';

export async function GET() {
  try {
    const db = await getDb();

    // 1. Total Metrics Counts
    const counts = await db.all(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN verification_status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN verification_status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
      FROM images
    `);
    
    const totalStats = counts[0] || { total: 0, pending: 0, approved: 0, rejected: 0 };

    // 2. Average Metrics
    const averages = await db.get(`
      SELECT 
        AVG(ai_confidence) as avg_confidence,
        AVG(CASE WHEN verified_price IS NOT NULL THEN verified_price ELSE ai_estimated_price END) as avg_price
      FROM images
    `);

    // 3. Most Common Values
    const commonStyle = await db.get(`
      SELECT COALESCE(verified_style, ai_style) as style, COUNT(*) as count 
      FROM images 
      WHERE style IS NOT NULL
      GROUP BY style ORDER BY count DESC LIMIT 1
    `);

    const commonOccasion = await db.get(`
      SELECT COALESCE(verified_occasion, ai_occasion) as occasion, COUNT(*) as count 
      FROM images 
      WHERE occasion IS NOT NULL
      GROUP BY occasion ORDER BY count DESC LIMIT 1
    `);

    const commonCoverage = await db.get(`
      SELECT COALESCE(verified_coverage, ai_coverage) as coverage, COUNT(*) as count 
      FROM images 
      WHERE coverage IS NOT NULL
      GROUP BY coverage ORDER BY count DESC LIMIT 1
    `);

    // 4. Design Elements Frequency counter
    const allElementsRows = await db.all(`
      SELECT COALESCE(verified_elements, ai_elements) as elements FROM images
    `);
    
    const elementCounts: Record<string, number> = {};
    for (const row of allElementsRows) {
      try {
        const elements: string[] = JSON.parse(row.elements || '[]');
        for (const el of elements) {
          elementCounts[el] = (elementCounts[el] || 0) + 1;
        }
      } catch (e) {
        // ignore parsing errors
      }
    }

    const sortedElements = Object.entries(elementCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const topElement = sortedElements[0] || { name: 'None', count: 0 };

    // 5. Daily Upload Trends (Last 7 days)
    const dailyUploads = await db.all(`
      SELECT 
        date(upload_date) as date_label, 
        COUNT(*) as count
      FROM images 
      GROUP BY date_label 
      ORDER BY date_label DESC 
      LIMIT 10
    `);

    // 6. Style Distribution
    const styleDistribution = await db.all(`
      SELECT 
        COALESCE(verified_style, ai_style) as style, 
        COUNT(*) as count
      FROM images 
      WHERE style IS NOT NULL
      GROUP BY style 
      ORDER BY count DESC
    `);

    // 7. Complexity Distribution
    const complexityDistribution = await db.all(`
      SELECT 
        COALESCE(verified_complexity, ai_complexity) as complexity, 
        COUNT(*) as count
      FROM images 
      WHERE complexity IS NOT NULL
      GROUP BY complexity 
      ORDER BY count DESC
    `);

    // 8. Coverage Distribution
    const coverageDistribution = await db.all(`
      SELECT 
        COALESCE(verified_coverage, ai_coverage) as coverage, 
        COUNT(*) as count
      FROM images 
      WHERE coverage IS NOT NULL
      GROUP BY coverage 
      ORDER BY count DESC
    `);

    return NextResponse.json({
      metrics: {
        total: totalStats.total || 0,
        pending: totalStats.pending || 0,
        approved: totalStats.approved || 0,
        rejected: totalStats.rejected || 0,
        avgConfidence: averages?.avg_confidence ? Math.round(averages.avg_confidence) : 0,
        avgPrice: averages?.avg_price ? Math.round(averages.avg_price) : 0,
        mostCommonStyle: commonStyle?.style || 'N/A',
        mostCommonOccasion: commonOccasion?.occasion || 'N/A',
        mostCommonCoverage: commonCoverage?.coverage || 'N/A',
        mostCommonElement: topElement.name || 'N/A',
      },
      charts: {
        dailyUploads: dailyUploads.reverse(),
        topStyles: styleDistribution.slice(0, 5),
        complexities: complexityDistribution,
        coverages: coverageDistribution,
        elements: sortedElements.slice(0, 8),
      }
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
