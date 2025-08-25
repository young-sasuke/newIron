// Test script to simulate rider webhook call
// This simulates what happens when a pickup rider marks order as "picked_up"

const PIKAGO_BASE_URL = 'http://localhost:3001' // Adjust if different
const ORDER_ID = 'ORD175610820210' // The order from your logs
const SECRET = 'your-internal-api-secret-here' // Replace with actual INTERNAL_API_SECRET

async function testRiderPickupWebhook() {
  console.log('🧪 Testing rider webhook: picked_up → reached sync...')
  
  try {
    const response = await fetch(`${PIKAGO_BASE_URL}/api/rider-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shared-secret': SECRET, // Using shared secret auth
      },
      body: JSON.stringify({
        orderId: ORDER_ID,
        status: 'picked_up',
        riderId: 'test-rider-123',
        riderName: 'Test Rider'
      })
    })

    console.log(`Response status: ${response.status}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Failed:', errorText)
    } else {
      const result = await response.json()
      console.log('✅ Success:', JSON.stringify(result, null, 2))
      console.log('')
      console.log('🔍 Check the server logs for:')
      console.log('  - "[Rider Webhooks] Processing picked_up for order"')
      console.log('  - "[Rider Webhooks] Updating IronXpress via API: ORD... -> reached"')
      console.log('  - "[IX Admin Orders] Updated order ORD... to reached"')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run the test
testRiderPickupWebhook()
