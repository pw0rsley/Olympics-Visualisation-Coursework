// ------------------------------------------------------------------------------------------------
// script.js - loads the json file, creates visual with D3 and handles interactive elements.
// ------------------------------------------------------------------------------------------------

// Note: references and comments are written throughout.


// ----------------------------------------------------------------
// 1. LOAD DATA
// ----------------------------------------------------------------

// Promise.all method from wk 10 js tutorial
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
    d3.json("countries.json")
    ]).then(([world, countries]) => {


 // ----------------------------------------------------------------
 // 2. SVG + PROJECTION
 // ----------------------------------------------------------------
  // ref for fitting projection: https://observablehq.com/@d3/world-choropleth/2

  // Control size of map in JS such that its variable for screen size, rather than fixed (fixed if using 100px in style.css, etc)
  const width = window.innerWidth;
  const height = window.innerHeight;
  const marginTop = 60;  // space for header

  const svg = d3.select("#chart")
    .attr("width",  width)
    .attr("height", height);

  // Convert the TopoJSON topology into a GeoJSON FeatureCollection (this has one Feature per country, with geometry + numeric id)
  const land = topojson.feature(world, world.objects.countries);

  // Options for mapping: const projection = d3.geoNaturalEarth1().fitSize([W, H], land); const projection = d3.geoOrthographic().fitSize([W, H], land);
  // geoPath converts GeoJSON geometry into SVG path "d" attribute strings
    const projection = d3.geoWinkel3().fitExtent([[2, marginTop + 2], [width - 2, height]], land);
    const path = d3.geoPath(projection);


  // ----------------------------------------------------------------
  // 3. DRAW BASE MAP
  //-------------------------------------------------------------------
  // Two layer approach from the D3 Observable choropleth notebook:
  // ref: https://observablehq.com/@d3/world-choropleth/2

  // Create one path per country, coloured by data.
  svg.append("g")
    .selectAll("path")
    .data(land.features) // topojson features
    .join("path")
      .attr("class", "country")
      .attr("d", path);

  // Next, add shared edges between two countries only.
  svg.append("path")
    .datum(topojson.mesh(world, world.objects.countries))
    .attr("class", "borders")
    .attr("d", path);


  // ----------------------------------------------------------------
  // 4. COMPUTE CENTROIDS
  //----------------------------------------------------------------

  const centroidMap = new Map();
  land.features.forEach(feature => {
    const centroid = path.centroid(feature); // gets centroid coordinates [x,y] of country (feature)
    {centroidMap.set(+feature.id, centroid); // saves centroid coords to the map
    }});

  // ----------------------------------------------------------------
  //  5. COLOUR SCALE
  // ----------------------------------------------------------------
  // d3.scaleSequential maps a continuous domain (temperature range). (1-t makes blue lowest and red highest).

  const temperatures = countries.map(d => d.avg_temp); // maps temperature from json to map.
   // console.log(temperatures.filter(t => t == null).length);
  const colorScale = d3.scaleSequential(d3.extent(temperatures), t => d3.interpolateRdYlBu(1-t)); // t is range of temperatures (from .extent) where 0 is coldest, 1 is hottest.

// define once outside
// Radius scale: scaleSqrt() ensures bubble area is proportional to medals. ref: https://observablehq.com/@d3/bubble-map/2 uses the same approach
const radius = d3.scaleSqrt()
  .range([1, 36]);  // just the range, domain set later. starts at 1 so excludes those with no medals.


  // SET RADIUS.DOMAIN OUTSIDE UPDATEBUBBLES SO LEGEND DOESNT CHANGE BETWEEN SUMMER/WINTER:
const overallMax = d3.max(countries, d => Math.max(d.medals.Summer, d.medals.Winter));
radius.domain([0, overallMax]);

  // ----------------------------------------------------------------
  //  6. BUBBLE LAYER
  // ----------------------------------------------------------------

  // An empty <g> that updateBubbles() fills with circle elements.
  const bubbleOutput = svg.append("g");


  // ----------------------------------------------------------------
  // 7. UPDATEBUBBLES FUNCTION
  //----------------------------------------------------------------
// What this does:
  // Called once on load and then whenever the dropdown changes. Only the bubble layer is updated each time.
  // This function does the following:
  // 1. selects medal count for a country in this given season
  // 2. Builds a square root radius scale from the min/max of these (https://observablehq.com/@d3/continuous-scales)
  // 3. Assigns centroid coords to each country
  // 4. extra step: sort bubbles so small are in front
  // 5. attach tooltip (tooltip method: https://observablehq.com/@clhenrick/tooltip-component)


 function updateBubbles(season) {

    const selectedSeason = season;  // season is from dropdown and is passed into this function.
    const data = countries
      .map(d => ({
        name: d.name,
        ioc: d.ioc,
        avg_temp: d.avg_temp,
        medals: d.medals,
        breakdown: d.breakdown,
        total: d.medals[selectedSeason],
        position: centroidMap.get(d.numeric_id) // attach centroid positions
      })).filter(d => d.position && d.total > 0);  // only countries on map with medals & position in topojson.



    // D3 update pattern:
    // Uses an ENTER/UPDATE with .join pattern: ref: https://observablehq.com/@d3/selection-join
    const t = svg.transition().duration(300); // define transitions for smoothess: https://observablehq.com/@d3/selection-join

    const circles = bubbleOutput // An empty <g> (svg) that updateBubbles() fills with circle elements.
         .selectAll("circle")
         .data(data, d => d.ioc)
         .join(
            enter => enter.append("circle") // enter: countries newly visible --> create <circle>
              .attr("class", "bubble")
              .attr("cx", d => d.position[0])
              .attr("cy", d => d.position[1])
              .attr("r", 0) // start radius "r" at 0 for a smooth transition.
              .attr("fill", d => colorScale(d.avg_temp))
              .call(enter => enter.transition(t)
                .attr("r", d => radius(d.total))),

            update => update
              .call(update => update.transition(t)
                .attr("r", d => radius(d.total))
                .attr("fill", d => colorScale(d.avg_temp))),

            exit => exit
              .call(exit => exit.transition(t)
                .attr("r", 0).remove())
          );
        // The json file was sorted in descending order in python, so when bubbles appear smaller ones are on top, for visibility.

      // ------------------------
      // CREATE AND ATTACH TOOLTIP:
      // -------------------------
      // for a given event, e:
      circles
      .on("mousemove", function(e, d) {
        const bd = d.breakdown[season]; // bd = breakdown
        d3.select("#tooltip")
          .classed("hide", false)
          .style("left", e.clientX + 30 + "px") // formatting: puts tooltip to the right of the mouse. ref: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent
          .style("top", e.clientY + "px")
          .html(`${d.name}<br>
                Avg. temp: ${d.avg_temp.toFixed(1)}°C<br>
                Gold: ${bd.gold} <br>
                Silver: ${bd.silver} <br>
                Bronze: ${bd.bronze}<br>
                Total medals: ${d.medals[season]}`);
      })
      .on("mouseout", () => d3.select("#tooltip").classed("hide", true));
            }


      // ----------------------------------------------------
      // (RE)INITIALISE UPDATEBUBBLES
      // ----------------------------------------------------
      // starts with summer. as dropdown changes, re-render updateBubbles

      updateBubbles("Summer");
      document.getElementById("season-label")
        .addEventListener("change", e => updateBubbles(e.target.value)); // Gets new HTML element value and re-renders updateBubbles with this. https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener


      // ----------------------------------------------------
      // BUILD LEGEND:
      // ----------------------------------------------------

// Size bubbles legend: SOURCE:
    // https://using-d3js.com/04_08_legends.html
    // https://d3-legend.susielu.com/#size

const legendSize = d3.legendSize()
  .scale(radius)
  .shape("circle")
  .shapePadding(15)
  .labelOffset(20)
.cells([10, 50, 150, 500])
  .title("Total Medals (post 2000)")
  .orient("horizontal")
  .labelFormat(d3.format(".0f"));

d3.select("#legend-size-svg")
  .append("g")
  .attr("transform", "translate(10, 12)")
  .call(legendSize);


    // ----------------------------------------------------
    // COLOUR LEGEND:
    // ----------------------------------------------------

// source:: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/linearGradient
// deployed in html file.

const [minTemp, maxTemp] = colorScale.domain(); // already defined in this block
const range = maxTemp - minTemp; // for iqr (q1/q3)

const midTemp = (minTemp + maxTemp) / 2;
document.getElementById("legend-min").textContent = `${minTemp.toFixed(0)}°`; // rounds
document.getElementById("legend-q1").textContent  = `${(minTemp + range/4).toFixed(0)}°`;
document.getElementById("legend-mid").textContent = `${midTemp.toFixed(0)}°`;
document.getElementById("legend-q3").textContent  = `${(minTemp + range*3/4).toFixed(0)}°`;
document.getElementById("legend-max").textContent = `${maxTemp.toFixed(0)}°`;

    });











