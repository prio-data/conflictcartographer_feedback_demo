
const GED_STYLE = {
   radius: 8,
   color: "black",
   fillColor: "#995555",
   fillOpacity: 0.8,
   weight: 2,
}

let DEFAULT_PRED_STYLE = {
   color: "#aabbcc",
   weight: 4,
   fillOpacity: 0.4,
   opacity: 0.8,
}

let red_green_pst = d3.scaleLinear()
   .domain([0,100])
   .range(["#ff0000","#00ff00"])
