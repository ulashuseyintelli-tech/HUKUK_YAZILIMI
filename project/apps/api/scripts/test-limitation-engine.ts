/**
 * Zamanaşımı Engine Test Script
 * 
 * Kullanım: npx ts-node scripts/test-limitation-engine.ts
 */

import { LimitationEngineService } from '../src/modules/limitation-engine/limitation-engine.service';

// Mock PrismaService
const mockPrisma = {
  limitationRiskLog: {
    create: async (data: any) => {
      console.log('📝 Risk log kaydedildi:', data);
      return data;
    }
  }
};

async function testLimitationEngine() {
  console.log('🧪 Zamanaşımı Engine Test Başlıyor...\n');

  // Service'i oluştur
  const service = new LimitationEngineService(mockPrisma as any);
  await service.onModuleInit();

  console.log('✅ Service başlatıldı\n');

  // Test 1: Çek - 3 yıl önce keşide edilmiş (zamanaşımı dolmuş)
  console.log('📋 Test 1: Çek - 3 yıl önce (zamanaşımı dolmuş olmalı)');
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  threeYearsAgo.setMonth(threeYearsAgo.getMonth() - 1); // 3 yıl 1 ay önce
  
  const result1 = await service.checkBeforeEnforcement({
    caseType: 'KAMBIYO',
    instrumentType: 'CEK',
    startDate: threeYearsAgo,
  });
  console.log('  Sonuç:', result1.status.level, '-', result1.status.message);
  console.log('  Modal gösterilmeli mi?', result1.shouldShowModal);
  console.log('');

  // Test 2: Çek - 2 yıl önce keşide edilmiş (90 gün içinde dolacak)
  console.log('📋 Test 2: Çek - 2 yıl 9 ay önce (yaklaşıyor olmalı)');
  const twoYearsNineMonthsAgo = new Date();
  twoYearsNineMonthsAgo.setFullYear(twoYearsNineMonthsAgo.getFullYear() - 2);
  twoYearsNineMonthsAgo.setMonth(twoYearsNineMonthsAgo.getMonth() - 9);
  
  const result2 = await service.checkBeforeEnforcement({
    caseType: 'KAMBIYO',
    instrumentType: 'CEK',
    startDate: twoYearsNineMonthsAgo,
  });
  console.log('  Sonuç:', result2.status.level, '-', result2.status.message);
  console.log('  Kalan gün:', result2.status.daysLeft);
  console.log('');

  // Test 3: Çek - 1 yıl önce keşide edilmiş (uygun)
  console.log('📋 Test 3: Çek - 1 yıl önce (uygun olmalı)');
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  const result3 = await service.checkBeforeEnforcement({
    caseType: 'KAMBIYO',
    instrumentType: 'CEK',
    startDate: oneYearAgo,
  });
  console.log('  Sonuç:', result3.status.level, '-', result3.status.message);
  console.log('  Kalan gün:', result3.status.daysLeft);
  console.log('');

  // Test 4: Senet/Bono - Asıl borçlu - 3 yıl
  console.log('📋 Test 4: Senet - 2 yıl önce (uygun olmalı)');
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  
  const result4 = await service.checkBeforeEnforcement({
    caseType: 'KAMBIYO',
    instrumentType: 'BONO',
    startDate: twoYearsAgo,
  });
  console.log('  Sonuç:', result4.status.level, '-', result4.status.message);
  console.log('  Kalan gün:', result4.status.daysLeft);
  console.log('');

  // Test 5: Senet - Ciranta - 1 yıl
  console.log('📋 Test 5: Senet - Ciranta - 6 ay önce (uygun olmalı)');
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const result5 = await service.checkBeforeEnforcement({
    caseType: 'KAMBIYO',
    instrumentType: 'BONO',
    startDate: sixMonthsAgo,
    role: 'CIRANTA',
  });
  console.log('  Sonuç:', result5.status.level, '-', result5.status.message);
  console.log('  Kalan gün:', result5.status.daysLeft);
  console.log('');

  // Test 6: İlam - 10 yıl
  console.log('📋 Test 6: İlam - 5 yıl önce (uygun olmalı)');
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  
  const result6 = await service.checkBeforeEnforcement({
    caseType: 'ILAMLI',
    startDate: fiveYearsAgo,
  });
  console.log('  Sonuç:', result6.status.level, '-', result6.status.message);
  console.log('  Kalan gün:', result6.status.daysLeft);
  console.log('');

  // Test 7: Kira - 5 yıl
  console.log('📋 Test 7: Kira - 4 yıl 10 ay önce (yaklaşıyor olmalı)');
  const fourYearsTenMonthsAgo = new Date();
  fourYearsTenMonthsAgo.setFullYear(fourYearsTenMonthsAgo.getFullYear() - 4);
  fourYearsTenMonthsAgo.setMonth(fourYearsTenMonthsAgo.getMonth() - 10);
  
  const result7 = await service.checkBeforeEnforcement({
    caseType: 'KIRA',
    startDate: fourYearsTenMonthsAgo,
  });
  console.log('  Sonuç:', result7.status.level, '-', result7.status.message);
  console.log('  Kalan gün:', result7.status.daysLeft);
  console.log('');

  // Test 8: Genel alacak - 10 yıl
  console.log('📋 Test 8: Genel alacak (fatura) - 8 yıl önce (uygun olmalı)');
  const eightYearsAgo = new Date();
  eightYearsAgo.setFullYear(eightYearsAgo.getFullYear() - 8);
  
  const result8 = await service.checkBeforeEnforcement({
    caseType: 'ILAMSIZ',
    startDate: eightYearsAgo,
  });
  console.log('  Sonuç:', result8.status.level, '-', result8.status.message);
  console.log('  Kalan gün:', result8.status.daysLeft);
  console.log('');

  // Test 9: Takip türü önerisi
  console.log('📋 Test 9: Takip türü önerisi - Kambiyo zamanaşımı dolmuş');
  const recommendations = await service.recommendEnforcementType({
    hasInstrument: true,
    instrumentType: 'CEK',
    instrumentStartDate: threeYearsAgo,
    generalStartDate: threeYearsAgo,
  });
  console.log('  Öneriler:');
  recommendations.forEach((r, i) => {
    console.log(`    ${i + 1}. ${r.typeName} - Skor: ${r.score} - Önerilen: ${r.isRecommended ? 'Evet' : 'Hayır'}`);
    if (r.message) console.log(`       ${r.message}`);
  });
  console.log('');

  console.log('✅ Tüm testler tamamlandı!');
}

testLimitationEngine().catch(console.error);
