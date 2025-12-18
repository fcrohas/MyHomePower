import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Data readiness checker for seq2point training
 * Analyzes available data and provides recommendations
 */

async function checkDataReadiness() {
  console.log('='.repeat(60))
  console.log('SEQ2POINT DATA READINESS CHECK')
  console.log('='.repeat(60))
  console.log()

  const dataDir = path.join(__dirname, '../../data')

  // Check if data directory exists
  if (!fs.existsSync(dataDir)) {
    console.error('❌ Data directory not found:', dataDir)
    console.log('\nPlease ensure your data directory exists with power-data-*.json files')
    return
  }

  // Load all files
  const files = fs.readdirSync(dataDir)
  const powerFiles = files.filter(f => f.startsWith('power-data-'))
  const tagFiles = files.filter(f => f.startsWith('power-tags-'))

  console.log('📁 Data Directory:', dataDir)
  console.log(`📊 Power data files: ${powerFiles.length}`)
  console.log(`🏷️  Tag data files: ${tagFiles.length}`)
  console.log()

  if (powerFiles.length === 0) {
    console.error('❌ No power data files found!')
    console.log('\nExpected files: power-data-YYYY-MM-DD.json')
    return
  }

  if (tagFiles.length === 0) {
    console.error('⚠️  No tag data files found!')
    console.log('\nTag files are required for training: power-tags-YYYY-MM-DD.json')
    return
  }

  // Analyze data
  const dateMap = new Map()
  const applianceStats = new Map()

  console.log('📈 Analyzing data...\n')

  for (const powerFile of powerFiles) {
    const dateMatch = powerFile.match(/power-data-(\d{4}-\d{2}-\d{2})\.json/)
    if (!dateMatch) continue
    
    const date = dateMatch[1]
    const tagFile = `power-tags-${date}.json`
    
    const powerPath = path.join(dataDir, powerFile)
    const tagPath = path.join(dataDir, tagFile)
    
    const powerData = JSON.parse(fs.readFileSync(powerPath, 'utf-8'))
    const hasTag = fs.existsSync(tagPath)
    
    const info = {
      date,
      dataPoints: powerData.data.length,
      hasTag,
      appliances: []
    }

    if (hasTag) {
      const tagData = JSON.parse(fs.readFileSync(tagPath, 'utf-8'))
      const appliances = new Set()
      
      for (const entry of tagData.entries) {
        const tags = entry.label.split(',').map(t => t.trim())
        tags.forEach(tag => {
          if (tag !== 'standby') {
            appliances.add(tag)
            
            // Calculate duration
            const [startH, startM] = entry.startTime.split(':').map(Number)
            const [endH, endM] = entry.endTime.split(':').map(Number)
            const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM)
            
            if (!applianceStats.has(tag)) {
              applianceStats.set(tag, {
                days: new Set(),
                totalMinutes: 0,
                occurrences: 0
              })
            }
            
            const stats = applianceStats.get(tag)
            stats.days.add(date)
            stats.totalMinutes += durationMinutes
            stats.occurrences++
          }
        })
      }
      
      info.appliances = Array.from(appliances)
    }

    dateMap.set(date, info)
  }

  // Sort dates
  const sortedDates = Array.from(dateMap.keys()).sort()
  
  console.log('📅 Date Range:')
  console.log(`   First: ${sortedDates[0]}`)
  console.log(`   Last: ${sortedDates[sortedDates.length - 1]}`)
  console.log(`   Total: ${sortedDates.length} days`)
  console.log()

  // Days with/without tags
  const daysWithTags = Array.from(dateMap.values()).filter(d => d.hasTag).length
  const daysWithoutTags = sortedDates.length - daysWithTags
  
  console.log('🏷️  Tag Coverage:')
  console.log(`   Days with tags: ${daysWithTags}`)
  console.log(`   Days without tags: ${daysWithoutTags}`)
  console.log()

  // Appliance statistics
  console.log('🔌 Appliance Statistics:\n')
  
  if (applianceStats.size === 0) {
    console.log('   ❌ No appliances found in tag data!')
    console.log()
    return
  }

  const appliances = Array.from(applianceStats.entries()).sort((a, b) => 
    b[1].days.size - a[1].days.size
  )

  for (const [appliance, stats] of appliances) {
    const avgMinutesPerDay = stats.totalMinutes / stats.days.size
    const readiness = getReadinessLevel(stats.days.size, avgMinutesPerDay)
    
    console.log(`   ${readiness.icon} ${appliance}`)
    console.log(`      Days: ${stats.days.size}`)
    console.log(`      Total active time: ${(stats.totalMinutes / 60).toFixed(1)} hours`)
    console.log(`      Avg per day: ${avgMinutesPerDay.toFixed(1)} minutes`)
    console.log(`      Occurrences: ${stats.occurrences}`)
    console.log(`      Status: ${readiness.message}`)
    console.log()
  }

  // Training recommendations
  console.log('💡 Training Recommendations:\n')
  
  const ready = appliances.filter(([_, s]) => s.days.size >= 7)
  const needMore = appliances.filter(([_, s]) => s.days.size < 7 && s.days.size > 0)
  
  if (ready.length > 0) {
    console.log('   ✅ Ready to train:')
    for (const [appliance] of ready) {
      console.log(`      • ${appliance}`)
      console.log(`        Command: node seq2point-train.js ${appliance}`)
    }
    console.log()
  }
  
  if (needMore.length > 0) {
    console.log('   ⚠️  Need more data:')
    for (const [appliance, stats] of needMore) {
      const needed = 7 - stats.days.size
      console.log(`      • ${appliance} (need ${needed} more days)`)
    }
    console.log()
  }

  // Sample counts estimation
  console.log('📊 Estimated Training Samples:\n')
  
  for (const [appliance, stats] of appliances) {
    // Average 8640 readings per day (24h * 60min * 6 per 10s)
    // With window length 599, we get ~8041 samples per day
    const estimatedSamples = stats.days.size * 8000
    console.log(`   ${appliance}: ~${estimatedSamples.toLocaleString()} samples`)
  }
  console.log()

  // Next steps
  console.log('='.repeat(60))
  console.log('NEXT STEPS')
  console.log('='.repeat(60))
  console.log()
  
  if (ready.length > 0) {
    console.log('1. Start training your first model:')
    console.log(`   cd server/ml`)
    console.log(`   node seq2point-train.js ${ready[0][0]}`)
    console.log()
    console.log('2. Test the trained model:')
    console.log(`   node seq2point-test.js ${ready[0][0]} ${sortedDates[sortedDates.length - 1]}`)
    console.log()
  } else {
    console.log('❌ Not enough data for training yet.')
    console.log()
    console.log('You need at least 7 days of labeled data per appliance.')
    console.log('Recommended: 14-30 days for better results.')
    console.log()
  }

  console.log('3. Check the documentation:')
  console.log('   • SEQ2POINT_QUICKSTART.md')
  console.log('   • SEQ2POINT_IMPLEMENTATION.md')
  console.log()
}

function getReadinessLevel(days, avgMinutesPerDay) {
  if (days >= 14 && avgMinutesPerDay >= 30) {
    return {
      icon: '✅',
      message: 'Excellent - Ready for training'
    }
  } else if (days >= 7 && avgMinutesPerDay >= 15) {
    return {
      icon: '✅',
      message: 'Good - Ready for training'
    }
  } else if (days >= 7) {
    return {
      icon: '⚠️',
      message: 'Ready but limited active time'
    }
  } else if (days >= 3) {
    return {
      icon: '⚠️',
      message: 'Need more days (minimum 7)'
    }
  } else {
    return {
      icon: '❌',
      message: 'Insufficient data'
    }
  }
}

// Run check
checkDataReadiness()
