import { PrismaClient, TransactionType, TransactionSource, TokenType } from '@prisma/client';


const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean up existing data (optional - remove if you want to keep existing data)
  await prisma.transaction.deleteMany();
  await prisma.p2POrder.deleteMany();
  await prisma.yesTokenHolding.deleteMany();
  await prisma.noTokenHolding.deleteMany();
  await prisma.yesToken.deleteMany();
  await prisma.noToken.deleteMany();
  await prisma.question.deleteMany();
  await prisma.admin.deleteMany();

  // Create Admin Users
  console.log('👨‍💼 Creating admin users...');
  const admin1 = await prisma.admin.create({
    data: {
      email: 'admin@predictionmarket.com',
      firstName: 'Admin',
      lastName: 'User',
      permissions: ['CREATE_QUESTION', 'RESOLVE_QUESTION', 'MANAGE_USERS'],
      isActive: true,
    },
  });

  const admin2 = await prisma.admin.create({
    data: {
      email: 'moderator@predictionmarket.com',
      firstName: 'Market',
      lastName: 'Moderator',
      permissions: ['CREATE_QUESTION', 'RESOLVE_QUESTION'],
      isActive: true,
    },
  });

  // Create Questions with Market Data
  console.log('❓ Creating questions...');
  
  // Question 1: Bitcoin $100K
  const question1 = await prisma.question.create({
    data: {
      title: 'Will Bitcoin reach $100,000 by end of 2025?',
      description: 'This market will resolve to YES if Bitcoin (BTC) reaches or exceeds $100,000 USD on any major exchange by December 31, 2025. Resolution based on CoinGecko, CoinMarketCap, or major exchange data.',
      category: 'crypto',
      imageUrl: 'https://example.com/bitcoin-image.jpg',
      resolutionDate: new Date('2025-12-31T23:59:59Z'),
      constantValue: 10000, // $10,000 constant
      totalYesTokens: 8000, // 8000 YES tokens in circulation
      totalNoTokens: 5000,  // 5000 NO tokens in circulation
      currentYesPrice: 1.25, // $10,000 / 8000 = $1.25
      currentNoPrice: 2.00,  // $10,000 / 5000 = $2.00
      initialTokenSupply: 10000,
      initialTokenPrice: 1.00,
      status: 'ACTIVE',
      createdById: admin1.id,
    },
  });

  // Question 2: AI and Software Development
  const question2 = await prisma.question.create({
    data: {
      title: 'Will AI replace 50% of software developers by 2030?',
      description: 'This market resolves to YES if credible studies show that AI has automated at least 50% of traditional software development roles by 2030. Resolution based on industry reports from major consulting firms.',
      category: 'technology',
      imageUrl: 'https://example.com/ai-image.jpg',
      resolutionDate: new Date('2030-12-31T23:59:59Z'),
      constantValue: 5000,
      totalYesTokens: 2500,  // Lower YES adoption
      totalNoTokens: 7500,   // Higher NO adoption
      currentYesPrice: 2.00, // $5,000 / 2500 = $2.00
      currentNoPrice: 0.67,  // $5,000 / 7500 = $0.67
      initialTokenSupply: 5000,
      initialTokenPrice: 1.00,
      status: 'ACTIVE',
      createdById: admin1.id,
    },
  });

  // Question 3: US Presidential Election
  const question3 = await prisma.question.create({
    data: {
      title: 'Will the next US President be a Democrat?',
      description: 'This market will resolve to YES if the candidate who wins the 2028 US Presidential Election is from the Democratic Party. Resolution based on official election results.',
      category: 'politics',
      imageUrl: 'https://example.com/election-image.jpg',
      resolutionDate: new Date('2028-11-15T23:59:59Z'),
      constantValue: 20000,
      totalYesTokens: 10000, // Even split
      totalNoTokens: 10000,  // Even split
      currentYesPrice: 2.00, // $20,000 / 10000 = $2.00
      currentNoPrice: 2.00,  // $20,000 / 10000 = $2.00
      initialTokenSupply: 10000,
      initialTokenPrice: 2.00,
      status: 'ACTIVE',
      createdById: admin2.id,
    },
  });

  // Question 4: Sports - World Cup
  const question4 = await prisma.question.create({
    data: {
      title: 'Will Messi win the 2026 World Cup?',
      description: 'This market resolves to YES if Lionel Messi is part of the Argentina squad that wins the 2026 FIFA World Cup. Resolution based on official FIFA results.',
      category: 'sports',
      imageUrl: 'https://example.com/messi-image.jpg',
      resolutionDate: new Date('2026-07-31T23:59:59Z'),
      constantValue: 15000,
      totalYesTokens: 12000,
      totalNoTokens: 3000,
      currentYesPrice: 1.25, // $15,000 / 12000 = $1.25
      currentNoPrice: 5.00,  // $15,000 / 3000 = $5.00
      initialTokenSupply: 7500,
      initialTokenPrice: 2.00,
      status: 'ACTIVE',
      createdById: admin2.id,
    },
  });

  // Question 5: Climate Change
  const question5 = await prisma.question.create({
    data: {
      title: 'Will global temperature rise exceed 1.5°C by 2030?',
      description: 'This market resolves to YES if global average temperature rise exceeds 1.5°C above pre-industrial levels by 2030, based on IPCC or NASA data.',
      category: 'environment',
      imageUrl: 'https://example.com/climate-image.jpg',
      resolutionDate: new Date('2030-12-31T23:59:59Z'),
      constantValue: 8000,
      totalYesTokens: 6000,
      totalNoTokens: 4000,
      currentYesPrice: 1.33, // $8,000 / 6000 = $1.33
      currentNoPrice: 2.00,  // $8,000 / 4000 = $2.00
      initialTokenSupply: 4000,
      initialTokenPrice: 2.00,
      status: 'ACTIVE',
      createdById: admin1.id,
    },
  });

  // Create YES and NO tokens for each question
  console.log('🪙 Creating tokens...');
  
  const questions = [question1, question2, question3, question4, question5];
  
  for (const question of questions) {
    // Create YES token
    await prisma.yesToken.create({
      data: {
        questionId: question.id,
        currentPrice: question.currentYesPrice,
        availableSupply: question.initialTokenSupply - question.totalYesTokens,
        circulatingSupply: question.totalYesTokens,
        totalVolume: Number(question.totalYesTokens) * Number(question.currentYesPrice) * 0.8, // Simulate some trading volume
      },
    });

    // Create NO token
    await prisma.noToken.create({
      data: {
        questionId: question.id,
        currentPrice: question.currentNoPrice,
        availableSupply: question.initialTokenSupply - question.totalNoTokens,
        circulatingSupply: question.totalNoTokens,
        totalVolume: Number(question.totalYesTokens) * Number(question.currentYesPrice) * 0.8, // Simulate some trading volume
      },
    });
  }

  // Create some sample P2P orders
  console.log('📋 Creating P2P orders...');
  
  // You'll need to replace these with actual user IDs from your test users
  const sampleUserId1 = 'cmcw9fg1m0000uw42coo6mxzz'; // Replace with actual user ID
  const sampleUserId2 = 'cmcw9it280000k42k03k8djzf'; // Replace with actual user ID
  const sampleUserId3 = 'cmcwa2ev20001xh3ou5a8bxx6'; // Replace with actual user ID

  try {
    // Sample P2P orders for Bitcoin question
    await prisma.p2POrder.create({
      data: {
        userId: sampleUserId1,
        questionId: question1.id,
        orderType: 'SELL',
        tokenType: 'YES',
        quantity: 100,
        pricePerToken: 1.30,
        totalAmount: 130.00,
        remainingQuantity: 100,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
    });

    await prisma.p2POrder.create({
      data: {
        userId: sampleUserId2,
        questionId: question1.id,
        orderType: 'BUY',
        tokenType: 'NO',
        quantity: 50,
        pricePerToken: 1.95,
        totalAmount: 97.50,
        remainingQuantity: 50,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      },
    });

    // Sample P2P orders for AI question
    await prisma.p2POrder.create({
      data: {
        userId: sampleUserId3,
        questionId: question2.id,
        orderType: 'SELL',
        tokenType: 'NO',
        quantity: 200,
        pricePerToken: 0.70,
        totalAmount: 140.00,
        remainingQuantity: 200,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      },
    });

    console.log('✅ P2P orders created (using sample user IDs)');
  } catch (error) {
    console.log('⚠️  Skipping P2P orders - please update with actual user IDs');
  }

  // Create some sample transactions for price history
  console.log('💰 Creating sample transactions...');
  
  const transactions = [
  {
    userId:sampleUserId1 , // Updated as requested
    questionId: question1.id,
    type: TransactionType.BUY,           // Use enum instead of 'BUY'
    source: TransactionSource.PLATFORM_MINT, // Use enum instead of 'PLATFORM_MINT'
    tokenType: TokenType.YES,            // Use enum instead of 'YES'
    quantity: 500,
    pricePerToken: 1.20,
    totalAmount: 600.00,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    userId: sampleUserId2, // Updated as requested
    questionId: question1.id,
    type: TransactionType.BUY,
    source: TransactionSource.PLATFORM_MINT,
    tokenType: TokenType.NO,             // Use enum instead of 'NO'
    quantity: 300,
    pricePerToken: 1.90,
    totalAmount: 570.00,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    userId: sampleUserId3, // Updated as requested
    questionId: question2.id,
    type: TransactionType.BUY,
    source: TransactionSource.PLATFORM_MINT,
    tokenType: TokenType.NO,
    quantity: 1000,
    pricePerToken: 0.65,
    totalAmount: 650.00,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
];
  try {
    for (const transaction of transactions) {
      await prisma.transaction.create({
        data: transaction,
      });
    }
    console.log('✅ Sample transactions created');
  } catch (error) {
    console.log('⚠️  Skipping transactions - please update with actual user IDs');
  }

  // Create some sample token holdings
  console.log('🏦 Creating token holdings...');
  
  try {
    // Sample YES token holdings
    await prisma.yesTokenHolding.create({
      data: {
        userId: sampleUserId1,
        questionId: question1.id,
        quantity: 500,
        averageBuyPrice: 1.20,
        totalInvested: 600.00,
        availableForSale: 100,
      },
    });

    await prisma.yesTokenHolding.create({
      data: {
        userId: sampleUserId2,
        questionId: question3.id,
        quantity: 250,
        averageBuyPrice: 1.95,
        totalInvested: 487.50,
        availableForSale: 50,
      },
    });

    // Sample NO token holdings
    await prisma.noTokenHolding.create({
      data: {
        userId: sampleUserId2,
        questionId: question1.id,
        quantity: 300,
        averageBuyPrice: 1.90,
        totalInvested: 570.00,
        availableForSale: 0,
      },
    });

    await prisma.noTokenHolding.create({
      data: {
        userId: sampleUserId3,
        questionId: question2.id,
        quantity: 1000,
        averageBuyPrice: 0.65,
        totalInvested: 650.00,
        availableForSale: 200,
      },
    });

    console.log('✅ Token holdings created');
  } catch (error) {
    console.log('⚠️  Skipping token holdings - please update with actual user IDs');
  }

  console.log('🎉 Database seeding completed successfully!');
  console.log(`
📊 Seeded data summary:
- ${questions.length} questions created
- ${questions.length * 2} tokens created (YES/NO pairs)
- 2 admin users created
- Sample P2P orders, transactions, and holdings created (update user IDs)
  `);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
