// Table RPE → pourcentage (rpe*10 simplifié)
export function rpeToPercent(rpe) {
  return rpe / 10
}

function normalizeStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Comparaison flexible de noms d'exercices (gère singulier/pluriel uniquement)
function exoMatch(a, b) {
  const na = normalizeStr(a)
  const nb = normalizeStr(b)
  if (na === nb) return true
  // Singulier/pluriel : retirer le 's' final
  if (na.replace(/s$/, '') === nb.replace(/s$/, '')) return true
  return false
}

// Calcul 1RM via Epley : charge * (1 + reps/30)
export function calcOneRM(charge, reps) {
  if (reps === 1) return charge
  return Math.round(charge * (1 + reps / 30))
}

/*
  Charge prédicte selon priorité :
  1. Si 1RM direct existe pour l'exercice → charge = rpe/10 * 1RM
  2. Si ratio existe (mvt adapté) → charge = rpe/10 * ratio * 1RM_mvt_roi
  3. Sinon → retourne null (on affiche juste "RPE X")

  maxTestes = { "Squat": 150, "DC": 120, ... }
  ratios = { "Split squat bulgare": { ratio: 0.6, mvtRoi: "Squat" }, ... }
*/
export function chargePredicte(exercice, rpe, nbReps, maxTestes = {}, ratios = {}, intensityUnit = 'RPE', poids = null) {
  let pct = 0
  const val = parseFloat(rpe)
  if (!val) return null

  if (intensityUnit === '%' || intensityUnit === 'PCT') {
    pct = val / 100
  } else if (intensityUnit === 'VITESSE' || intensityUnit === 'Vitesse (m/s)') {
    let pctVal = Math.round(100 - ((val - 0.2) / (1.3 - 0.2)) * 70)
    pctVal = Math.max(10, Math.min(100, pctVal))
    pct = pctVal / 100
  } else if (intensityUnit === 'PDC') {
    return null // PDC = poids du corps, pas de charge calculée
  } else if (intensityUnit === '% PDC') {
    if (poids && poids > 0) {
      return arrondir(poids * val / 100)
    }
    return null
  } else if (intensityUnit === 'kg' || intensityUnit === 'W') {
    return null // kg/W = valeur libre, pas de charge calculée
  } else {
    pct = val / 10
  }

  // Cas 1 : 1RM direct (recherche insensible à la casse, aux accents et aux espaces)
  const exoNorm = normalizeStr(exercice)
  const isDebugExo = exoNorm.includes('haltere') || exoNorm.includes('tirage') || exoNorm.includes('dc');
  if (isDebugExo) {
    console.log(`[chargePredicte Debug] exercice: "${exercice}", pct: ${pct}, maxTestes keys: [${Object.keys(maxTestes || {})}]`);
  }

  let oneRM = null
  for (const [key, val] of Object.entries(maxTestes || {})) {
    if (normalizeStr(key) === exoNorm) {
      oneRM = parseFloat(val)
      break
    }
  }
  if (oneRM && oneRM > 0) {
    const charge = pct * oneRM
    const res = arrondir(charge)
    if (isDebugExo) console.log(`  -> [chargePredicte Debug] Trouvé 1RM direct: ${oneRM} kg. Charge calculée: ${charge} kg -> Arrondi: ${res} kg`);
    return res
  }

  // Cas 2 : ratio via mvt roi
  if (ratios) {
    const ratioData = ratios[exercice]
    if (ratioData) {
      const { ratio, mvtRoi } = ratioData
      const mvtRoiNorm = normalizeStr(mvtRoi)
      let oneRMMvtRoi = null
      for (const [key, val] of Object.entries(maxTestes || {})) {
        if (normalizeStr(key) === mvtRoiNorm) {
          oneRMMvtRoi = parseFloat(val)
          break
        }
      }
      if (oneRMMvtRoi && oneRMMvtRoi > 0) {
        const charge = pct * ratio * oneRMMvtRoi
        const res = arrondir(charge)
        if (isDebugExo) console.log(`  -> [chargePredicte Debug] Trouvé via ratio classique mvtRoi: ${res} kg`);
        return res
      }
    }

    // Cas 2b : ratio via format Firestore "cible_vs_tested" (objet ou tableau)
    const nomNorm = normalizeStr(exercice)
    if (Array.isArray(ratios)) {
      for (const r of ratios) {
        if (r && r.cible && (normalizeStr(r.cible) === nomNorm)) {
          const testedNorm = normalizeStr(r.tested)
          let testMax = null
          for (const [key, val] of Object.entries(maxTestes || {})) {
            if (normalizeStr(key) === testedNorm) {
              testMax = parseFloat(val)
              break
            }
          }
          if (isDebugExo) console.log(`  -> [chargePredicte Debug] Match ratio (Tableau) cible: ${r.cible}, tested: ${r.tested}, ratio: ${r.ratio}, testMax trouvé: ${testMax}`);
          if (testMax && testMax > 0) {
            const charge = pct * (parseFloat(r.ratio) || 0) * testMax
            const res = arrondir(charge)
            if (isDebugExo) console.log(`  -> [chargePredicte Debug] Trouvé via ratio (Tableau): ${res} kg`);
            return res
          }
        }
      }
    } else if (typeof ratios === 'object' && ratios !== null) {
      for (const [key, valRatio] of Object.entries(ratios)) {
        const match = key.match(/^(.+)_vs_(.+)$/)
        if (!match) continue
        const cible = normalizeStr(match[1])
        const tested = normalizeStr(match[2])
        if (cible === nomNorm) {
          let testMax = null
          for (const [k, val] of Object.entries(maxTestes || {})) {
            if (normalizeStr(k) === tested) {
              testMax = parseFloat(val)
              break
            }
          }
          if (isDebugExo) console.log(`  -> [chargePredicte Debug] Match ratio (Objet) key: "${key}", valRatio: ${valRatio}, testMax trouvé: ${testMax}`);
          if (testMax && testMax > 0) {
            const charge = pct * valRatio * testMax
            const res = arrondir(charge)
            if (isDebugExo) console.log(`  -> [chargePredicte Debug] Trouvé via ratio (Objet): ${res} kg`);
            return res
          }
        }
      }
    }
  }

  // Cas 3 : aucune référence
  return null
}

// Arrondi au 2.5kg le plus proche
function arrondir(charge) {
  return Math.round(charge / 2.5) * 2.5
}

// Calcul spécifique pour preview % : si intensityUnit est '%', calcule le kg correspondant
// Retourne null si pas de 1RM trouvé ou si unité n'est pas '%'
export function chargePreviewPct(exercice, pct, maxTestes = {}, ratios = {}) {
  if (!pct || pct <= 0) return null
  
  // Chercher 1RM direct
  const exoNorm = normalizeStr(exercice)
  let oneRM = null
  for (const [key, val] of Object.entries(maxTestes || {})) {
    if (normalizeStr(key) === exoNorm) {
      oneRM = parseFloat(val)
      break
    }
  }
  
  // Si pas de 1RM direct, chercher via ratio
  if (!oneRM && ratios) {
    const ratioData = ratios[exercice]
    if (ratioData) {
      const { ratio, mvtRoi } = ratioData
      const mvtRoiNorm = normalizeStr(mvtRoi)
      let oneRMMvtRoi = null
      for (const [key, val] of Object.entries(maxTestes || {})) {
        if (normalizeStr(key) === mvtRoiNorm) {
          oneRMMvtRoi = parseFloat(val)
          break
        }
      }
      if (oneRMMvtRoi && oneRMMvtRoi > 0) {
        oneRM = oneRMMvtRoi * ratio
      }
    }
    
    // Si toujours pas de 1RM, essayer avec le format Firestore "cible_vs_tested" (objet ou tableau)
    if (!oneRM) {
      const nomNorm = normalizeStr(exercice)
      if (Array.isArray(ratios)) {
        for (const r of ratios) {
          if (r && r.cible && (normalizeStr(r.cible) === nomNorm)) {
            const testedNorm = normalizeStr(r.tested)
            let testMax = null
            for (const [key, val] of Object.entries(maxTestes || {})) {
              if (normalizeStr(key) === testedNorm) {
                testMax = parseFloat(val)
                break
              }
            }
            if (testMax && testMax > 0) {
              oneRM = testMax * (parseFloat(r.ratio) || 0)
              break
            }
          }
        }
      } else if (typeof ratios === 'object' && ratios !== null) {
        for (const [key, val] of Object.entries(ratios)) {
          const match = key.match(/^(.+)_vs_(.+)$/)
          if (!match) continue
          const cible = normalizeStr(match[1])
          const tested = normalizeStr(match[2])
          if (cible === nomNorm) {
            let testMax = null
            for (const [k, val] of Object.entries(maxTestes || {})) {
              if (normalizeStr(k) === tested) {
                testMax = parseFloat(val)
                break
              }
            }
            if (testMax && testMax > 0) {
              oneRM = testMax * val
              break
            }
          }
        }
      }
    }
  }
  
  if (!oneRM || oneRM <= 0) return null
  
  // Calcul : pct% du 1RM
  const charge = (pct / 100) * oneRM
  if (exoNorm.includes('squat')) console.log(`[chargePreviewPct] ${exercice} pct=${pct} oneRM=${oneRM} charge=${charge} -> ${arrondir(charge)}`)
  return arrondir(charge)
}

// Label affiché dans la vue
export function labelCharge(exercice, rpe, nbReps, maxTestes = {}, ratios = {}, intensityUnit = 'RPE', poids = null) {
  const c = chargePredicte(exercice, rpe, nbReps, maxTestes, ratios, intensityUnit, poids)
  if (c !== null) return c + ' kg'
  
  if (intensityUnit === 'PCT' || intensityUnit === '%') {
    return rpe + '%'
  } else if (intensityUnit === 'VITESSE' || intensityUnit === 'Vitesse (m/s)') {
    return rpe + ' m/s'
  } else if (intensityUnit === 'PDC') {
    return 'PDC'
  } else if (intensityUnit === '% PDC') {
    return rpe + '% PDC'
  } else if (intensityUnit === 'kg') {
    return rpe + ' kg'
  } else if (intensityUnit === 'W') {
    return rpe + ' W'
  }
  return 'RPE ' + rpe
}

/*
  Charge preview avancée avec logique de recommandation par bloc :
  1. Si le joueur a déjà fait cet exercice dans le même bloc (nom du bloc) → recommandation basée sur la dernière charge × progression %
  2. Sinon, si un 1RM existe pour cet exercice → charge = pct% du 1RM
  3. Sinon → null (pas de préconisation, juste l'objectif en %)

  Si le joueur n'a JAMAIS fait cet exercice (aucune dataPerf) → null (pas de préconisation)

  Paramètres additionnels :
  - blocNom : nom du bloc actuel (pour chercher l'historique dans le même bloc)
  - allSeances : tableau de toutes les séances (pour trouver les séances précédentes avec le même bloc)
  - currentSeanceId : ID de la séance actuelle (à exclure de la recherche)

  Retourne : { chargeCalculee, chargeReference, evolutionPct, source }
  - chargeCalculee : charge recommandée (kg)
  - chargeReference : dernière charge réalisée dans le même bloc (kg) ou null
  - evolutionPct : évolution en points de pourcentage (+2, -3, etc.) ou null
  - source : 'bloc' | '1rm' | null
*/

export function chargePreviewAdvanced(exercice, pct, maxTestes = {}, dataPerf = [], cycles = [], cycleId = null, seanceDate = null, ratios = {}, blocNom = null, allSeances = [], currentSeanceId = null, serieIndex = null) {
  if (!pct || pct <= 0) return null

  const exoNorm = normalizeStr(exercice)

  // Vérifier si le joueur a au moins une performance enregistrée pour cet exercice
  // Inclure charge=0 (ex: tractions PDC sans poids renseigné)
  const perfsForExo = dataPerf.filter(p =>
    exoMatch(p.exercice, exercice) && (p.charge > 0 || p.charge === 0)
  )

  // DEBUG: log si on a des perfs pour cet exo
  if (perfsForExo.length === 0 && dataPerf.length > 0) {
    const allExos = [...new Set(dataPerf.map(p => p.exercice))].filter(Boolean)
    console.warn(`[chargePreviewAdvanced] Aucune perf pour "${exercice}" (normalisé: "${exoNorm}"). Exos dans dataPerf:`, allExos.slice(0, 10))
  }
  if (exoNorm.includes('squat') || exoNorm.includes('box')) {
    console.log(`[DEBUG ${exercice}] pct=${pct} cycleId=${cycleId} perfsForExo=${perfsForExo.length} maxTestes keys:`, Object.keys(maxTestes).filter(k => k.toLowerCase().includes('squat') || k.toLowerCase().includes('box')))
  }

  let chargeCalculee = null
  let chargeReference = null
  let evolutionPct = null
  let source = null

  // Helper: trouve la meilleure perf dans une fenêtre de N mois avant seanceDate (ou aujourd'hui)
  function bestPerfInWindow(mois) {
    const refDate = seanceDate || new Date().toISOString().split('T')[0]
    const cutoff = new Date(refDate)
    cutoff.setMonth(cutoff.getMonth() - mois)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return [...perfsForExo]
      .filter(p => p.charge > 0 && p.date && p.date >= cutoffStr && p.date < refDate)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null
  }

  // 1. Vérifier si l'exercice a des perfs avec charge dans les séances du même cycle
  const seancesDuCycle = cycleId
    ? allSeances.filter(s => s.id !== currentSeanceId && s.cycleId === cycleId && (!seanceDate || !s.date || s.date < seanceDate))
    : []
  const seanceIdsDuCycle = new Set(seancesDuCycle.map(s => s.id))
  const perfsDansCycle = perfsForExo.filter(p =>
    p.charge > 0 &&
    p.seanceId !== currentSeanceId &&
    (seanceIdsDuCycle.has(p.seanceId) ||
      seancesDuCycle.some(s => s.date && p.date && (
        p.date === s.date ||
        Math.abs(new Date(p.date + 'T12:00:00') - new Date(s.date + 'T12:00:00')) <= 86400000
      ))
    )
  )

  if (perfsDansCycle.length > 0) {
    // L'exercice a été fait dans ce cycle : chercher le bestMatch dans le même bloc
    if (blocNom) {
      const blocNomLower = normalizeStr(blocNom)
      const previousSeancesWithBloc = seancesDuCycle.filter(s =>
        s.blocs?.some(b => normalizeStr(b.nom) === blocNomLower)
      )
      let bestMatch = null

      for (const s of previousSeancesWithBloc) {
        const bloc = s.blocs?.find(b => normalizeStr(b.nom) === blocNomLower)
        if (!bloc) continue
        let foundExo = null
        for (const g of (bloc.groupes || [])) {
          foundExo = g.exercices?.find(e => exoMatch(e.exercice, exercice))
          if (foundExo) break
        }
        if (!foundExo) continue
        const sDate = s.date || ''
        const perf = perfsForExo.find(p => {
          if (p.seanceId === s.id) return true
          if (p.date && sDate && p.date === sDate) return true
          if (p.date && sDate) {
            const pTime = new Date(p.date + 'T12:00:00').getTime()
            const sTime = new Date(sDate + 'T12:00:00').getTime()
            if (!isNaN(pTime) && !isNaN(sTime) && Math.abs(pTime - sTime) <= 86400000) return true
          }
          return false
        })
        if (perf) {
          let previousPct
          if (foundExo.variableSeries && foundExo.seriesData) {
            // Séries variables : utiliser le % de la série correspondante si on connaît l'index
            if (serieIndex !== null && foundExo.seriesData[serieIndex] != null) {
              previousPct = parseFloat(foundExo.seriesData[serieIndex].intensity)
            } else {
              continue // index inconnu : impossible de comparer, skip
            }
          } else {
            const prevIntensityUnit = foundExo.intensityUnit || foundExo.intensityType || 'RPE'
            previousPct = (prevIntensityUnit === '%' || prevIntensityUnit === 'PCT')
              ? parseFloat(foundExo.rpe)
              : parseFloat(foundExo.rpe) * 10
          }
          const perfOneRM = perf.oneRM || perf.charge || 0
          const bestOneRM = bestMatch ? (bestMatch.perf.oneRM || bestMatch.perf.charge || 0) : 0
          if (!bestMatch || perfOneRM > bestOneRM) {
            bestMatch = { perf, previousPct }
          }
        }
      }

      if (bestMatch && bestMatch.previousPct > 0 && bestMatch.perf.charge > 0) {
        chargeReference = bestMatch.perf.charge
        evolutionPct = Math.round(pct - bestMatch.previousPct)
        chargeCalculee = arrondir(chargeReference * (1 + evolutionPct / 100))
        source = 'bloc'
      }
    }

    // Pas de bestMatch valide dans le bloc : fallback 1RM + référence progressive
    if (chargeCalculee === null) {
      chargeCalculee = chargePreviewPct(exercice, pct, maxTestes, ratios)
      if (chargeCalculee !== null) {
        source = '1rm'
        const ref = bestPerfInWindow(3) || bestPerfInWindow(6) || bestPerfInWindow(12)
        if (ref) chargeReference = ref.charge
      } else {
        const ref = bestPerfInWindow(3) || bestPerfInWindow(6) || bestPerfInWindow(12)
        if (ref) {
          chargeReference = ref.charge
          chargeCalculee = arrondir(ref.charge)
          source = 'derniere_perf'
        }
      }
    }
  } else {
    // Pas de perf pour cet exercice dans ce cycle : 1RM progressif 3→6→12 mois
    chargeCalculee = chargePreviewPct(exercice, pct, maxTestes, ratios)
    if (chargeCalculee !== null) {
      source = '1rm'
      const ref = bestPerfInWindow(3) || bestPerfInWindow(6) || bestPerfInWindow(12)
      if (ref) chargeReference = ref.charge
    } else {
      const ref = bestPerfInWindow(3) || bestPerfInWindow(6) || bestPerfInWindow(12)
      if (ref) {
        chargeReference = ref.charge
        chargeCalculee = arrondir(ref.charge)
        source = 'derniere_perf'
      }
    }
  }

  // 2. Si toujours pas de chargeCalculee, fallback sur le 1RM seul (max testé)
  // Chercher aussi une chargeReference dans les fenêtres progressives pour affichage
  if (chargeCalculee === null) {
    chargeCalculee = chargePreviewPct(exercice, pct, maxTestes, ratios)
    if (chargeCalculee !== null) {
      source = '1rm'
      if (chargeReference === null && perfsForExo.some(p => p.charge > 0)) {
        const ref = bestPerfInWindow(3) || bestPerfInWindow(6) || bestPerfInWindow(12)
        if (ref) chargeReference = ref.charge
      }
    }
  }

  // 3. Si toujours pas de chargeCalculee (pas de 1RM) → null (pas de préconisation)
  if (chargeCalculee === null) return null

  return {
    chargeCalculee,
    chargeReference,
    evolutionPct,
    source
  }
}

// Score wellness global
export function calcWellnessScore(hooper, sommeil, tapCount, refTap = 70) {
  if (!hooper || Object.keys(hooper).length === 0) return null
  const vals = Object.values(hooper)
  const hooперMoy = vals.reduce((a, b) => a + b, 0) / vals.length
  const sommeilScore = sommeil ? Math.min((sommeil / 8) * 7, 7) : hooперMoy
  const tapScore = tapCount ? Math.min((tapCount / refTap) * 7, 7) : hooперMoy
  return parseFloat(((hooперMoy * 0.5) + (sommeilScore * 0.3) + (tapScore * 0.2)).toFixed(2))
}

// Détection variation brutale > 1.5 écart-type sur 7 jours
export function detectVariation(historique, scoreAujourdhui) {
  if (!historique || historique.length < 3) return false
  const vals = historique.slice(-7).map(h => h.score).filter(v => v != null)
  if (vals.length < 3) return false
  const moy = vals.reduce((a, b) => a + b, 0) / vals.length
  const sd = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - moy, 2), 0) / vals.length)
  if (sd === 0) return false
  return Math.abs(scoreAujourdhui - moy) > 1.5 * sd
}
