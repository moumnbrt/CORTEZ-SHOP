import { config } from './config.js';

const money = (value) =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export async function notifyOrder(order) {
  const url = config.discord.orderWebhookUrl;
  if (!url) return false;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'CORTEZ SHOP',
      embeds: [{
        title: ' طلب جديد',
        color: 0xf107a5,
        fields: [
          { name: 'الزبون', value: String(order.username || '—'), inline: true },
          { name: 'المنتج', value: String(order.productName || '—'), inline: true },
          { name: 'الكمية', value: String(order.quantity ?? 0), inline: true },
          { name: 'سعر الوحدة', value: money(order.unitPrice), inline: true },
          { name: 'الإجمالي', value: money(order.total), inline: true },
          { name: 'الحالة', value: String(order.status || 'قيد الانتظار'), inline: true },
        ],
        footer: { text: 'CORTEZ CRIME SYNDICATE • LOS SANTOS' },
        timestamp: order.createdAt || new Date().toISOString(),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook Discord: ${response.status}`);
  }
  return true;
}
