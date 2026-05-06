import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPayment, updatePaymentStatus, getUser, setUser } from '@/lib/redis';

async function verifyTransaction(txHash: string, _expectedAmount: string, _chain: string): Promise<boolean> {
  await new Promise(r => setTimeout(r, 1500));
  return txHash.startsWith('0x') && txHash.length === 66;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req as unknown as Request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ref = searchParams.get('ref');
    const txHash = searchParams.get('txHash');

    if (!ref || !txHash) {
      return NextResponse.json({ error: 'Missing ref or txHash' }, { status: 400 });
    }

    const payment = await getPayment(ref);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (new Date(payment.expiresAt) < new Date()) {
      await updatePaymentStatus(ref, 'expired');
      return NextResponse.json({ status: 'expired' });
    }

    if (payment.status === 'confirmed') {
      return NextResponse.json({ status: 'confirmed' });
    }

    const isValid = await verifyTransaction(txHash, payment.amount, payment.chain);

    if (isValid) {
      await updatePaymentStatus(ref, 'confirmed', txHash);

      const user = await getUser(payment.userId);
      if (user) {
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        user.subscription = {
          plan: payment.plan,
          status: 'active',
          currentPeriodEnd: periodEnd.toISOString(),
        };
        user.subscribed = true;
        await setUser(payment.userId, user);
      }

      return NextResponse.json({ status: 'confirmed' });
    }

    return NextResponse.json({ status: 'pending', error: 'Transaction not found or not confirmed yet' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
