import { NextRequest, NextResponse } from 'next/server';
import { getPayment, updatePaymentStatus } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get('ref');

    if (!ref) {
      return NextResponse.json({ error: 'Missing ref' }, { status: 400 });
    }

    const payment = await getPayment(ref);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (new Date(payment.expiresAt) < new Date()) {
      await updatePaymentStatus(ref, 'expired');
      return NextResponse.json({ status: 'expired' });
    }

    return NextResponse.json({
      status: payment.status,
      plan: payment.plan,
      amount: payment.amount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
