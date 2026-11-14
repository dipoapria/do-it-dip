import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceName, productLabel, qtyTag, tidyUnits } from '../src/names.ts';

test('quantity follows what was bought: (2 pcs), (3 pcs), (12 pcs); weights in kg', () => {
  assert.equal(qtyTag(1), '');
  assert.equal(qtyTag(2), ' (2 pcs)');
  assert.equal(qtyTag(3), ' (3 pcs)');
  assert.equal(qtyTag(12), ' (12 pcs)');
  assert.equal(qtyTag(1.024), ' (1,024 kg)');
  assert.equal(productLabel('Roma Kelapa 300 g', 3), 'Roma Kelapa 300 gr (3 pcs)');
});

test('units: grams as "gr", ml, kg, L, with a space', () => {
  assert.equal(tidyUnits('Indomie Goreng Ayam Panggang Jumbo 127 g'), 'Indomie Goreng Ayam Panggang Jumbo 127 gr');
  assert.equal(tidyUnits('Roma Kelapa 300GR'), 'Roma Kelapa 300 gr');
  assert.equal(tidyUnits('JMB127G'), 'JMB 127 gr');
  assert.equal(tidyUnits('Harpic 200ML'), 'Harpic 200 ml');
  assert.equal(tidyUnits('Bimoli 2L'), 'Bimoli 2 L');
  assert.equal(tidyUnits('Gula 1,5 KG'), 'Gula 1,5 kg');
  assert.equal(tidyUnits('So Klin Liquid Korean 525/510gr'), 'So Klin Liquid Korean 525/510 gr');
  assert.equal(tidyUnits('Telur Ayam Negeri Curah /kg'), 'Telur Ayam Negeri Curah /kg');
});

test('names: capitals become readable, written names stay', () => {
  assert.equal(niceName('SO KLIN LIQ KOREAN 525/510gr'), 'So Klin Liq Korean 525/510 gr');
  assert.equal(niceName('INDOMIE GRG CB IJO JUMBO120g'), 'Indomie Grg Cb Ijo Jumbo 120 gr');
  assert.equal(niceName('Indomie Goreng Ayam Panggang Jumbo 127 g'), 'Indomie Goreng Ayam Panggang Jumbo 127 gr');
  assert.equal(niceName('TELUR AYAM NEGERI CURAH /KG'), 'Telur Ayam Negeri Curah /kg');
});

test('receipt title: one product, several with a shop, several without', async () => {
  const { receiptTitle, shopName } = await import('../src/names.ts');
  assert.equal(receiptTitle([{ name: 'AQUA BTL 600ML' }], 'Indomaret'), 'Aqua Btl 600 ml');
  const lotte = Array.from({ length: 8 }, (_, i) => ({ name: `Produk ${i + 1}` }));
  assert.equal(receiptTitle(lotte, 'LOTTE Grosir'), 'Belanja Lotte Grosir · 8 produk');
  assert.equal(receiptTitle(lotte.slice(0, 3), 'Kedai Senja', 'makan'), 'Makan di Kedai Senja · 3 produk');
  assert.equal(receiptTitle([{ name: 'Indomie Goreng Ayam Panggang Jumbo 127 gr' }, { name: 'Roma Kelapa 300 gr (2 pcs)' }, { name: 'Harpic' }], ''),
    'Indomie Goreng Ayam Pangg…, Roma Kelapa 300 gr +1');
  assert.equal(receiptTitle([], ''), 'Belanja');
  assert.equal(receiptTitle([], 'Alfamart'), 'Belanja Alfamart');
  assert.equal(shopName('LOTTE Grosir'), 'Lotte Grosir');
  assert.equal(shopName('KFC'), 'KFC');
  assert.ok(receiptTitle(lotte, 'Toko Serba Ada Sumber Rejeki Makmur Sentosa Abadi Jaya').length <= 60);
});
