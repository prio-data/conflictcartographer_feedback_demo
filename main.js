/*
 * Hacky, quick prototype showing some ways to evaluate a set of polygon
 * predictions of point data (ged events).
 * 
 * Written as a prototypel, to develop the metrics.
 */
const {Component,h,render} = window.preact;
const {difference,area,intersect,union,buffer,pointsWithinPolygon} = window.turf;

const map = L.map('map-element',{zoomControl:false}).setView([17.5, -0.0], 6);

var Stamen_Toner = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.{ext}', {
	attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	subdomains: 'abcd',
	minZoom: 0,
	maxZoom: 20,
	ext: 'png'
}).addTo(map)

let state = {
   preds: {
      geojson:empty_fc(), 
      layer:L.geoJSON(undefined,)
   },
   buffered: {
      geojson:empty_fc(), 
      layer:L.geoJSON(undefined,{
         style:{
            className: "nopointer-layer"
         }
      })
   },
   ged: {
      geojson: empty_fc(), 
      layer:L.geoJSON(undefined,{
         pointToLayer: (_,latlng)=>{
            return L.circleMarker(latlng,GED_STYLE)
         },
         style: {
            className: "nopointer-layer"
         }
      })
   }
}

let controls = {
   buffer_size: 40,
   selected: undefined,
   metric: "coverage",
}

let get_from_state = (state,what)=>{
   let obj = {}
   Object.entries(state).forEach(entries=>{
      let [key,val] = entries
      obj[key] = val[what]
   })
   return obj
}
let get_geojson = (state)=>get_from_state(state,"geojson")
let get_layers = (state)=>get_from_state(state,"layer")

const read_controls = (controls) => {
   let ctrl = document.querySelector("input[name='buffer-size']")
   controls.buffer_size = Number.parseInt(ctrl.value)
   return controls
}

const preds_table = (state) =>{
   let table = d3.select("#show-preds")
   

   let rows = table
      .selectAll("tr:not(.table-header)")
      .data(state.preds.geojson.features)
      .join("tr")
      .classed("selected",false)

   rows.filter(row=>row.properties.selected)
      .classed("selected",true)

   rows
      .selectAll("td")
      .data(row=>{
         return [ 
            row.properties.intensity,
            row.properties.confidence,
            `${Math.round(row.properties.cov*4)/4}\t%`,
            row.properties.lower,
            row.properties.upper,
            row.properties.actual,
            row.properties.correct?"Yes":"No",
         ]
      })
      .join("td")
         .text(e=>e)

   return state
}

const show_metric = (state,controls)=>{
   let metric = 0
   if(controls.metric == "coverage"){
      metric_title = "Mean coverage"
      sum = state.preds.geojson.features
         .map(ftr=>ftr.properties.cov)
         .reduce((a,b)=>a+b)
      metric = sum / state.preds.geojson.features.length
   } else {
      metric_title = "Overall accuracy"
      number_correct = state.preds.geojson.features
         .map(ftr=>ftr.properties.correct)
         .reduce((a,b)=>a+b)
      metric = number_correct / state.preds.geojson.features.length
   }

   let preds = state.preds.geojson.features
      .filter(ftr=>ftr.properties.intensity != 99)
      .reduce(union)
   let total_predicted = area(preds)

   document.querySelector("#show-metric").innerHTML = `
      <table>
         <tr>
            <td class="title">${metric_title}</td>
            <td>${Math.round(metric*3)/3}%</td>
         </tr>
         <tr>
            <td class="title">Total predicted area</td>
            <td>${Math.round(total_predicted / 1000000)} sq.km</td>
         </tr>
      </table>
   `
   return state
}

const update = (map,state,controls) =>{
   controls = read_controls(controls)
   let layers = get_layers(state)

   Object.values(layers).forEach(lyr=>{
      map.removeLayer(lyr)
      lyr.clearLayers()
   })

   state = calculate_buffered(state,controls)
   state = evaluate_predictions(state,controls)
   
   state = data_to_layers(state)
   state = add_handlers(state,controls)

   state = viz_update(state,controls)

   filter_layers(layers,controls)
      .forEach(lyr => map.addLayer(lyr))

   return map
}

const viz_update = (state,controls)=>{
   state = restyle_buffered(state)
   state = restyle_preds(state,controls)
   state = preds_table(state)
   state = show_metric(state,controls)
   state = restyle_ged(state,controls)
   return state
}

const filter_layers = (layers,controls)=>{
   return Object.entries(layers)
      .filter(entry=>{
         if(controls.metric == "coverage"){
            return true
         } else {
            if(entry[0] == "buffered"){
               return false
            } else {
               return true
            }
         }
         return true
      })
      .map(entry=>entry[1])
}

const add_handlers = (state,controls)=>{
   state.preds.layer.eachLayer(lyr=>{
      lyr.on("mouseover",e=>{
         controls.selected = e.target
         e.target.feature.properties.selected = true
         viz_update(state,controls)
      })
      lyr.on("mouseout",e=>{
         controls.selected = undefined 
         e.target.feature.properties.selected = false 
         viz_update(state,controls)
      })
   })
   return state
}

const evaluate_predictions = (state,_) => {
   state.preds.geojson.features.forEach(ftr=>{

      let ged_events = pointsWithinPolygon(state.ged.geojson,ftr)
      let actual = 0
      if(ged_events.features.length > 0){
         actual = ged_events.features
            .map(ftr=>ftr.properties.best)
            .reduce((a,b)=>a+b)
      }

      ftr.properties.actual = actual
      let {lower,upper} = SCALE[ftr.properties.intensity]
      ftr.properties.lower = lower 
      ftr.properties.upper = upper

      ftr.properties.correct = lower <= actual && upper >= actual

      let itr = intersect(
         state.buffered.geojson,
         ftr
      )
      let intersect_prop = 0
      if(itr){
         if([1,99].includes(ftr.properties.intensity)){
            intersect_prop = 100 - (area(itr) / area(ftr) * 100)
         } else {
            intersect_prop = area(itr) / area(ftr) * 100
         }
      }
      ftr.properties.cov = intersect_prop
   })
   
   return state
}

const pred_popups = (state)=>{
   state.preds.layer.eachLayer(lyr=>{
      lyr.bindPopup(()=>{
         return JSON.stringify(lyr.feature.properties)
      })
   })
   return state
}

let data_to_layers = (state)=> {
   Object.values(state).forEach(entry=>{
      entry.layer.addData(entry.geojson)
   })
   return state
}

let calculate_buffered = (state,controls) =>{
   state.buffered.geojson = (buffer(state.ged.geojson,controls.buffer_size))
      .features.reduce(union)
   return state
}

let restyle_preds = (state,controls)=>{
   state.preds.layer.eachLayer(lyr=>{
      switch(controls.metric){
         case "accuracy": 
            lyr.setStyle(DEFAULT_PRED_STYLE)
            lyr.setStyle({
               color: lyr.feature.properties.correct?"green":"red"
            })
            break
         case "coverage":
            lyr.setStyle(DEFAULT_PRED_STYLE)
            result_pst = lyr.feature.properties.cov
            lyr.setStyle({
               color: red_green_pst(result_pst)
            })
            break
      }
      let selected = lyr === controls.selected
      if(selected){
         lyr.setStyle({
            weight: 10
         })
      }
      if(lyr.feature.properties.intensity == 99){
         lyr.setStyle({fillOpacity: 0.1,opacity: 0.3})
      }
   })
   return state
}

let restyle_buffered = (state) =>{
   state.buffered.layer.eachLayer(lyr=>{
      lyr.setStyle({
         color: "black",
         fillColor: "#ccaacc",
         fillOpacity: 0.7,
         weigth: 2,
      })
   })
   return state
}

let restyle_ged = (state,controls)=>{
   state.ged.layer.setStyle(GED_STYLE)
   if(controls.metric == "coverage"){
      state.ged.layer.eachLayer(lyr=>{
         if(lyr.feature.properties.predicted){
            lyr.setStyle({fillColor: "#aaffaa"})
         } else {
            lyr.setStyle({fillColor: "#993333"})
         }
      })
   } else {
      state.ged.layer.eachLayer(lyr=>{
         lyr.setStyle({radius: 4 +(lyr.feature.properties.best)})
      })
   }
   return state
}

/* Initialization */

let ged_resp = axios.get("data/ged.geojson")
   .then((r)=>{
      state.ged.geojson = r.data
   })

axios.get("data/preds.geojson")
   .then(async (preds_response)=>{
      await ged_resp
      let preds = preds_response.data
      let mali
      await axios.get("data/mali.geojson")
         .then((r)=>{
            mali = r.data
         })

      let all_preds = preds.features.reduce(union) 
      let nullpred = difference(mali,all_preds)

      nullpred.properties = {
         intensity: 99,
         confidence: 100
      }

      preds.features.push(nullpred)

      state.preds.geojson = preds 
      
      state.ged.geojson.features.forEach(ftr=>{
         ftr.properties.predicted = false
      })
      state.preds.geojson.features.forEach(ftr=>{
         if(![99,1].includes(ftr.properties.intensity)){
            let points = pointsWithinPolygon(state.ged.geojson,ftr)
            points.features.forEach(ftr=>{
               ftr.properties.predicted = true
            })
         }
      })

      update(map,state,controls)
   })

let update_button = document.querySelector("button#update-button")
update_button.onclick = ()=>{
   update(map,state,controls)
}

let mode_selector = document.querySelector("select[name='mode-selector']")
mode_selector.onchange = ()=>{
   controls.metric = mode_selector.value
   update(map,state,controls)
   //update(map,state,controls)
}

let header = d3.select("#show-preds")
   .append("tr")
   .classed("table-header",true)

HEADER.forEach(hdr=>{
   header.append("th").text(hdr)
})
