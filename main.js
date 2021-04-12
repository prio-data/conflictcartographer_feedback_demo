const {Component,h,render} = window.preact;

const map = L.map('map-element',{zoomControl:false}).setView([16.29, -5.25], 6);

var Stamen_Toner = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.{ext}', {
	attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	subdomains: 'abcd',
	minZoom: 0,
	maxZoom: 20,
	ext: 'png'
}).addTo(map)

const scale = {
   0:{lower:0,upper:1},
   1:{lower:2,upper:25},
   2:{lower:26,upper:99},
   3:{lower:100,upper:999},
   4:{lower:1000,upper:99999},
}

let ged = {"type":"FeatureCollection","features":[]}
let preds = {"type":"FeatureCollection","features":[]}
let selected = undefined

let DEFAULT_PRED_STYLE = {
   color: "#aabbcc",
   weight: 4,
   fillOpacity: 0.4,
   opacity: 0.8,
}

const showSelected = (selected)=>{
   let element = document.querySelector("#selected")
   if(selected !== undefined){
      let props = selected.feature.properties
      let predicted = scale[props.intensity]
      let pred_formatted = `${predicted.lower}-${predicted.upper}`
      let correct = props.correct 
      display = `
         <p class="statistic">
            <span class="boxed">Actual</span>
            <span class="boxed">${props.actual}</span>
         </p> 
         <p class="statistic">
            <span class="boxed">Prediction</span>
            <span class="boxed">${pred_formatted}</span><br>
         </p>
         <p class="statistic">
            <span class="boxed">Discrepancy</span>
            <span class="boxed">${props.discrepancy}</span><br>
         </p>
         <p class="statistic">
            <span class="boxed">Verdict</span>
            <span class="boxed${correct?" good":" bad"}">
               ${correct? "Was correct":"Not correct"}
            </span>
         </p>
      `
   } else {
      display = "" 
   }
   element.innerHTML = display
}

let pred_features = L.geoJSON(undefined,{
      onEachFeature: (ftr,lyr)=>{
         let ged_for_feature = turf.pointsWithinPolygon(ged,ftr)

         let casualties = 0
         if(ged_for_feature.features.length > 0){
            casualties = ged_for_feature
               .features
               .map(ftr=>ftr.properties.best)
               .reduce((a,b)=>a+b)
         }
         let {lower,upper} = scale[ftr.properties.intensity]

         ftr.properties.lower = lower
         ftr.properties.upper = upper
         ftr.properties.correct = lower <=casualties && upper >= casualties
           
         let discrepancy = {
            lower: casualties - lower,
            upper: upper - casualties,
            abs : 0
         }

         discrepancy.abs = discrepancy.lower > 0? discrepancy.lower:0
         discrepancy.abs = discrepancy.upper < 0? discrepancy.upper:0

         ftr.properties.correct = discrepancy.abs == 0
         ftr.properties.discrepancy = Math.abs(discrepancy.abs)
         ftr.properties.actual = casualties

         lyr.on("mouseover",(e)=>{
            selected = e.target
            showSelected(selected)
            restyle_preds()
         })
         lyr.on("mouseout",()=>{
            selected = undefined 
            showSelected(selected)
            restyle_preds()
         })

         lyr.bindPopup(`
            Predicted: 
            ${scale[ftr.properties.intensity].lower} - 
            ${scale[ftr.properties.intensity].upper}
            <br>
            Actual: ${ftr.properties.actual}
         `)
         return ftr
      },
   })
   .addTo(map)

let restyle_preds = ()=>{
   pred_features.eachLayer(lyr=>{
      lyr.setStyle(DEFAULT_PRED_STYLE)
      if(lyr.feature.properties.correct){
         lyr.setStyle({color:"#55dd55"})
      } else {
         lyr.setStyle({color:"#dd5555"})
         lyr.setStyle({fillOpacity:0.1+Math.min(0.9,(0.9*(lyr.feature.properties.discrepancy/100)))})
      }
      if(lyr === selected){
         lyr.setStyle({fillOpacity:0.8})
      }
   })
}

let ged_features = L.geoJSON(undefined,{
      pointToLayer: (feature,latlng)=>{
         layer = L.circleMarker(latlng, {
            radius: 4+(feature.properties.best),
            color: "#bb4422",
            fillOpacity: 0.6,
            weight: 0
         });
         layer.bindPopup(`
            Casualties: ${feature.properties.best}
         `)
         return layer
      }
   })
   .addTo(map)


let ged_resp = axios.get("data/ged.geojson")
   .then((r)=>{
      ged = r.data
      ged_features.addData(r.data)
   })

axios.get("data/preds.geojson")
   .then(async (r)=>{
      await ged_resp
      preds = r.data
      pred_features.addData(r.data)
      ged_features.bringToFront()
      restyle_preds()
   })
