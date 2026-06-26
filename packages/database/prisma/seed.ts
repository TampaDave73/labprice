import { PrismaClient, Role, PriceSource } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Categories ──
  const categories = [
    { name: 'Vitamins & Minerals', slug: 'vitamins-minerals', displayOrder: 1, colorBg: 'oklch(0.95 0.06 145)', colorText: 'oklch(0.35 0.14 145)' },
    { name: 'Hormones', slug: 'hormones', displayOrder: 2, colorBg: 'oklch(0.95 0.06 310)', colorText: 'oklch(0.38 0.14 310)' },
    { name: 'Metabolic', slug: 'metabolic', displayOrder: 3, colorBg: 'oklch(0.95 0.05 220)', colorText: 'oklch(0.38 0.12 220)' },
    { name: 'Blood Count', slug: 'blood-count', displayOrder: 4, colorBg: 'oklch(0.95 0.06 30)', colorText: 'oklch(0.4 0.14 30)' },
    { name: 'Cancer Markers', slug: 'cancer-markers', displayOrder: 5, colorBg: 'oklch(0.95 0.05 15)', colorText: 'oklch(0.4 0.14 15)' },
  ];

  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const result = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { ...cat },
      create: { ...cat },
    });
    categoryMap[cat.name] = result.id;
  }
  console.log(`  ${categories.length} categories upserted`);

  // ── Vendors ──
  const vendorNames = [
    'Life Extension', 'Ulta Lab Tests', 'True Health Labs', 'DirectLabs',
    'Walk-In Lab', 'Request A Test', 'Quest Diagnostics', 'LabCorp',
    'Health Testing Centers', 'Any Lab Test Now',
  ];

  const vendorMap: Record<string, string> = {};
  for (const name of vendorNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const result = await prisma.vendor.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
    vendorMap[name] = result.id;
  }
  console.log(`  ${vendorNames.length} vendors upserted`);

  // ── Tests ──
  const tests = [
    { name: 'Vitamin D 25-Hydroxy', shortName: 'Vitamin D', slug: 'vitamin-d-25-hydroxy', category: 'Vitamins & Minerals', questCode: '17306', labcorpCode: '081950', isPopular: true, description: 'Measures the level of 25-hydroxyvitamin D in the blood, the best indicator of overall vitamin D status.', displayOrder: 1 },
    { name: 'Testosterone Total', shortName: 'Testosterone', slug: 'testosterone-total', category: 'Hormones', questCode: '873', labcorpCode: '004226', isPopular: true, description: 'Measures the total amount of testosterone in the blood, including both bound and free testosterone.', displayOrder: 2 },
    { name: 'CBC (Complete Blood Count)', shortName: 'CBC', slug: 'cbc-complete-blood-count', category: 'Blood Count', questCode: '6399', labcorpCode: '005009', isPopular: true, description: 'Evaluates overall health by measuring red blood cells, white blood cells, hemoglobin, hematocrit, and platelets.', displayOrder: 3 },
    { name: 'Lipid Panel', shortName: 'Lipid Panel', slug: 'lipid-panel', category: 'Metabolic', questCode: '7600', labcorpCode: '303756', isPopular: true, description: 'Measures cholesterol levels including total cholesterol, LDL, HDL, and triglycerides.', displayOrder: 4 },
    { name: 'TSH (Thyroid Stimulating Hormone)', shortName: 'TSH', slug: 'tsh-thyroid-stimulating-hormone', category: 'Hormones', questCode: '867', labcorpCode: '004259', isPopular: true, description: 'Measures thyroid-stimulating hormone to evaluate thyroid function.', displayOrder: 5 },
    { name: 'HbA1c (Hemoglobin A1c)', shortName: 'HbA1c', slug: 'hba1c-hemoglobin-a1c', category: 'Metabolic', questCode: '496', labcorpCode: '001453', isPopular: true, description: 'Measures average blood sugar levels over the past 2-3 months.', displayOrder: 6 },
    { name: 'Comprehensive Metabolic Panel', shortName: 'CMP', slug: 'comprehensive-metabolic-panel', category: 'Metabolic', questCode: '10231', labcorpCode: '322000', isPopular: false, description: 'A group of 14 tests that measure electrolytes, blood sugar, kidney function, and liver function.', displayOrder: 7 },
    { name: 'PSA (Prostate-Specific Antigen)', shortName: 'PSA', slug: 'psa-prostate-specific-antigen', category: 'Cancer Markers', questCode: '34', labcorpCode: '070234', isPopular: false, description: 'Measures the level of prostate-specific antigen in the blood, used for prostate cancer screening.', displayOrder: 8 },
    { name: 'Ferritin', shortName: 'Ferritin', slug: 'ferritin', category: 'Vitamins & Minerals', questCode: '457', labcorpCode: '004598', isPopular: false, description: 'Measures the amount of stored iron in the body.', displayOrder: 9 },
    { name: 'Cortisol', shortName: 'Cortisol', slug: 'cortisol', category: 'Hormones', questCode: '395', labcorpCode: '004341', isPopular: false, description: 'Measures the level of cortisol, the primary stress hormone.', displayOrder: 10 },
    { name: 'Vitamin B12', shortName: 'Vitamin B12', slug: 'vitamin-b12', category: 'Vitamins & Minerals', questCode: '927', labcorpCode: '000429', isPopular: false, description: 'Measures the level of vitamin B12, essential for nerve function and red blood cell production.', displayOrder: 11 },
    { name: 'Estradiol', shortName: 'Estradiol', slug: 'estradiol', category: 'Hormones', questCode: '30289', labcorpCode: '004515', isPopular: false, description: 'Measures the level of estradiol, the most potent form of estrogen.', displayOrder: 12 },
  ];

  // Prices: ordered by vendorNames array
  const priceData: Record<string, number[]> = {
    'vitamin-d-25-hydroxy': [29, 34, 36, 41, 44, 47, 49, 54, 59, 79],
    'testosterone-total':   [31, 27, 42, 39, 49, 52, 58, 63, 69, 89],
    'cbc-complete-blood-count': [21, 18, 26, 24, 29, 34, 39, 42, 49, 59],
    'lipid-panel':          [28, 24, 35, 32, 39, 44, 48, 52, 58, 74],
    'tsh-thyroid-stimulating-hormone': [26, 22, 34, 31, 38, 43, 47, 52, 55, 69],
    'hba1c-hemoglobin-a1c': [24, 20, 32, 28, 37, 41, 45, 49, 54, 65],
    'comprehensive-metabolic-panel': [30, 26, 39, 35, 44, 49, 53, 57, 62, 79],
    'psa-prostate-specific-antigen': [33, 28, 42, 38, 47, 53, 58, 62, 68, 85],
    'ferritin':             [29, 25, 37, 34, 42, 46, 52, 55, 61, 78],
    'cortisol':             [35, 30, 44, 40, 49, 55, 59, 64, 70, 89],
    'vitamin-b12':          [27, 23, 36, 32, 40, 44, 48, 53, 57, 72],
    'estradiol':            [33, 28, 42, 38, 48, 54, 59, 64, 69, 85],
  };

  const testMap: Record<string, string> = {};
  for (const t of tests) {
    const result = await prisma.test.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        shortName: t.shortName,
        categoryId: categoryMap[t.category]!,
        questCode: t.questCode,
        labcorpCode: t.labcorpCode,
        isPopular: t.isPopular,
        description: t.description,
        displayOrder: t.displayOrder,
      },
      create: {
        name: t.name,
        shortName: t.shortName,
        slug: t.slug,
        categoryId: categoryMap[t.category]!,
        questCode: t.questCode,
        labcorpCode: t.labcorpCode,
        isPopular: t.isPopular,
        description: t.description,
        displayOrder: t.displayOrder,
      },
    });
    testMap[t.slug] = result.id;

    // Upsert test codes
    await prisma.testCode.upsert({
      where: { testId_codeType: { testId: result.id, codeType: 'QUEST' } },
      update: { codeValue: t.questCode },
      create: { testId: result.id, codeType: 'QUEST', codeValue: t.questCode },
    });
    await prisma.testCode.upsert({
      where: { testId_codeType: { testId: result.id, codeType: 'LABCORP' } },
      update: { codeValue: t.labcorpCode },
      create: { testId: result.id, codeType: 'LABCORP', codeValue: t.labcorpCode },
    });
  }
  console.log(`  ${tests.length} tests upserted`);

  // ── Offerings ──
  let offeringCount = 0;
  for (const t of tests) {
    const prices = priceData[t.slug]!;
    for (let i = 0; i < vendorNames.length; i++) {
      const vendorId = vendorMap[vendorNames[i]!]!;
      const testId = testMap[t.slug]!;
      const price = prices[i]!;

      await prisma.offering.upsert({
        where: { testId_vendorId: { testId, vendorId } },
        update: {
          currentPrice: price,
          priceUpdatedAt: new Date(),
          isActive: true,
        },
        create: {
          testId,
          vendorId,
          currentPrice: price,
          priceUpdatedAt: new Date(),
          isActive: true,
        },
      });
      offeringCount++;
    }
  }
  console.log(`  ${offeringCount} offerings upserted`);

  // ── Biomarkers ──
  const biomarkers = [
    { name: '25-Hydroxyvitamin D', slug: '25-hydroxyvitamin-d', unit: 'ng/mL', tests: ['vitamin-d-25-hydroxy'] },
    { name: 'Total Testosterone', slug: 'total-testosterone', unit: 'ng/dL', tests: ['testosterone-total'] },
    { name: 'White Blood Cells', slug: 'white-blood-cells', unit: 'K/uL', tests: ['cbc-complete-blood-count'] },
    { name: 'Red Blood Cells', slug: 'red-blood-cells', unit: 'M/uL', tests: ['cbc-complete-blood-count'] },
    { name: 'Hemoglobin', slug: 'hemoglobin', unit: 'g/dL', tests: ['cbc-complete-blood-count'] },
    { name: 'Hematocrit', slug: 'hematocrit', unit: '%', tests: ['cbc-complete-blood-count'] },
    { name: 'Platelets', slug: 'platelets', unit: 'K/uL', tests: ['cbc-complete-blood-count'] },
    { name: 'Total Cholesterol', slug: 'total-cholesterol', unit: 'mg/dL', tests: ['lipid-panel'] },
    { name: 'LDL Cholesterol', slug: 'ldl-cholesterol', unit: 'mg/dL', tests: ['lipid-panel'] },
    { name: 'HDL Cholesterol', slug: 'hdl-cholesterol', unit: 'mg/dL', tests: ['lipid-panel'] },
    { name: 'Triglycerides', slug: 'triglycerides', unit: 'mg/dL', tests: ['lipid-panel'] },
    { name: 'TSH', slug: 'tsh', unit: 'mIU/L', tests: ['tsh-thyroid-stimulating-hormone'] },
    { name: 'Hemoglobin A1c', slug: 'hemoglobin-a1c', unit: '%', tests: ['hba1c-hemoglobin-a1c'] },
    { name: 'Glucose', slug: 'glucose', unit: 'mg/dL', tests: ['comprehensive-metabolic-panel'] },
    { name: 'BUN', slug: 'bun', unit: 'mg/dL', tests: ['comprehensive-metabolic-panel'] },
    { name: 'Creatinine', slug: 'creatinine', unit: 'mg/dL', tests: ['comprehensive-metabolic-panel'] },
    { name: 'Sodium', slug: 'sodium', unit: 'mEq/L', tests: ['comprehensive-metabolic-panel'] },
    { name: 'Potassium', slug: 'potassium', unit: 'mEq/L', tests: ['comprehensive-metabolic-panel'] },
    { name: 'Calcium', slug: 'calcium', unit: 'mg/dL', tests: ['comprehensive-metabolic-panel'] },
    { name: 'ALT', slug: 'alt', unit: 'U/L', tests: ['comprehensive-metabolic-panel'] },
    { name: 'AST', slug: 'ast', unit: 'U/L', tests: ['comprehensive-metabolic-panel'] },
    { name: 'PSA', slug: 'psa', unit: 'ng/mL', tests: ['psa-prostate-specific-antigen'] },
    { name: 'Ferritin', slug: 'ferritin', unit: 'ng/mL', tests: ['ferritin'] },
    { name: 'Cortisol', slug: 'cortisol', unit: 'ug/dL', tests: ['cortisol'] },
    { name: 'Vitamin B12', slug: 'vitamin-b12', unit: 'pg/mL', tests: ['vitamin-b12'] },
    { name: 'Estradiol', slug: 'estradiol', unit: 'pg/mL', tests: ['estradiol'] },
  ];

  for (const b of biomarkers) {
    const biomarker = await prisma.biomarker.upsert({
      where: { slug: b.slug },
      update: { name: b.name, unit: b.unit },
      create: { name: b.name, slug: b.slug, unit: b.unit },
    });

    for (const testSlug of b.tests) {
      const testId = testMap[testSlug]!;
      await prisma.testBiomarker.upsert({
        where: { testId_biomarkerId: { testId, biomarkerId: biomarker.id } },
        update: {},
        create: { testId, biomarkerId: biomarker.id },
      });
    }
  }
  console.log(`  ${biomarkers.length} biomarkers upserted`);

  // ── Admin User ──
  await prisma.user.upsert({
    where: { email: 'admin@labprice.com' },
    update: { role: Role.SUPER_ADMIN },
    create: {
      email: 'admin@labprice.com',
      name: 'LabPrice Admin',
      role: Role.SUPER_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });
  console.log('  1 admin user upserted');

  // ── Feature Flags ──
  const featureFlags = [
    { key: 'price_alerts', description: 'Enable price alert notifications for users', isEnabled: false },
    { key: 'scraper_v2', description: 'Use the v2 scraping engine with Playwright', isEnabled: false },
    { key: 'affiliate_tracking', description: 'Enable affiliate click tracking and revenue reporting', isEnabled: true },
    { key: 'search_suggestions', description: 'Show search autocomplete suggestions', isEnabled: true },
    { key: 'user_registration', description: 'Allow new user sign-ups', isEnabled: true },
    { key: 'price_history_charts', description: 'Show price history charts on test detail pages', isEnabled: false },
  ];

  for (const ff of featureFlags) {
    await prisma.featureFlag.upsert({
      where: { key: ff.key },
      update: { description: ff.description, isEnabled: ff.isEnabled },
      create: ff,
    });
  }
  console.log(`  ${featureFlags.length} feature flags upserted`);

  // ── System Settings ──
  const systemSettings = [
    { key: 'scrape_interval_hours', value: 24 },
    { key: 'max_price_change_percent', value: 50 },
    { key: 'auto_approve_threshold_percent', value: 10 },
    { key: 'items_per_page', value: 20 },
    { key: 'sitemap_enabled', value: true },
  ];

  for (const s of systemSettings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log(`  ${systemSettings.length} system settings upserted`);

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
