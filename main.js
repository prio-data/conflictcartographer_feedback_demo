const {Component,h,render} = window.preact;
const {area,intersect,union,buffer} = window.turf;

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
   },
}

let controls = {
   buffer_size: 40,
   selected: undefined
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
         ]
      })
      .join("td")
         .text(e=>e)

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


   Object.values(layers).forEach(lyr=>map.addLayer(lyr))

   return map
}

const viz_update = (state,controls)=>{
   state = restyle_buffered(state)
   state = restyle_preds(state,controls)
   state = preds_table(state)
   return state
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
      let itr = intersect(
         state.buffered.geojson,
         ftr
      )

      intersect_prop = 0
      if(itr){
         intersect_prop = area(itr) / area(ftr) * 100
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
      lyr.setStyle(DEFAULT_PRED_STYLE)
         result_pst = lyr.feature.properties.cov
      lyr.setStyle({
         color: red_green_pst(result_pst)
      })
      let selected = lyr === controls.selected
      if(selected){
         lyr.setStyle({
            weight: 10
         })

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

let ged_resp = axios.get("data/ged.geojson")
   .then((r)=>{
      state.ged.geojson = r.data
   })

axios.get("data/preds.geojson")
   .then(async (r)=>{
      await ged_resp
      state.preds.geojson = r.data
      update(map,state,controls)
   })

let update_button = document.querySelector("button#update-button")
update_button.onclick = ()=>{
   update(map,state,controls)
}

let header = d3.select("#show-preds")
   .append("tr")
   .classed("table-header",true)

HEADER.forEach(hdr=>{
   header.append("th").text(hdr)
})
