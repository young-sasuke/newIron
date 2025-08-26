// Direct test of the rider-status webhook
// This will test the picked_up -> reached sync without using the UI

async function testPickupSync() {
  console.log('🧪 Testing picked_up → reached sync...')
  
  const ORDER_ID = 'ORD1756194131804' // Use the order ID from your logs
  const SECRET = '918273645' // Your secret
  
  try {
    console.log(`📋 Testing order: ${ORDER_ID}`)
    console.log('🔄 Calling PG rider-status webhook...')
    
    const response = await fetch('http://localhost:3001/api/rider-webhooks/picked-up', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shared-secret': SECRET,
      },
      body: JSON.stringify({
        orderId: ORDER_ID,
        status: 'picked_up',
        riderId: 'test-rider-123',
        riderName: 'Test Rider'
      })
    })
    
    console.log(`📊 Response status: ${response.status}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Webhook failed:', errorText)
      return
    }
    
    const result = await response.json()
    console.log('✅ Webhook response:', JSON.stringify(result, null, 2))
    
    // Wait a moment then check IX status
    console.log('\n⏳ Waiting 2 seconds then checking IX status...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const ixResponse = await fetch('http://localhost:3000/api/admin/orders', {
      headers: { 'x-shared-secret': SECRET }
    })
    
    if (ixResponse.ok) {
      const ixData = await ixResponse.json()
      const order = ixData.orders?.find(o => o.id === ORDER_ID)
      
      console.log(`🔍 IX order status: ${order?.order_status || 'not found'}`)
      console.log(`🎯 Expected: 'reached'`)
      console.log(`${order?.order_status === 'reached' ? '🎉 SUCCESS!' : '❌ FAILED'} Sync ${order?.order_status === 'reached' ? 'working' : 'not working'}`)
    } else {
      console.error('❌ Could not check IX status')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

console.log('🚀 Starting pickup sync test...')
console.log('📝 Make sure both servers are running:')
console.log('   - Pikago: http://localhost:3001')
console.log('   - IronXpress: http://localhost:3000')
console.log('')

testPickupSync()
