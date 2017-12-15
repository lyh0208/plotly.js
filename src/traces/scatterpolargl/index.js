/**
* Copyright 2012-2017, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var ScatterGl = require('../scattergl');
var isNumeric = require('fast-isnumeric');
var calcColorscales = require('../scatter/colorscale_calc');
var Axes = require('../../plots/cartesian/axes');
var kdtree = require('kdgrass');
var Lib = require('../../lib');

function calc(container, trace) {
    var layout = container._fullLayout;
    var subplotId = trace.subplot;
    var radialAxis = layout[subplotId].radialaxis;
    var angularAxis = layout[subplotId].angularaxis;
    var rArray = radialAxis.makeCalcdata(trace, 'r');
    var thetaArray = angularAxis.makeCalcdata(trace, 'theta');
    var count = rArray.length;
    var stash = {};
    var subplot = layout[subplotId];

    var positions = new Array(count * 2), x = Array(count), y = Array(count);

    function c2rad(v) {
        return angularAxis.c2rad(v, trace.thetaunit);
    }

    for(var i = 0; i < count; i++) {
        var r = rArray[i];
        var theta = thetaArray[i];

        if(isNumeric(r) && isNumeric(theta)) {
            var rad = c2rad(theta);

            x[i] = positions[i * 2] = r * Math.cos(rad);
            y[i] = positions[i * 2 + 1] = r * Math.sin(rad);
        } else {
            x[i] = y[i] = positions[i * 2] = positions[i * 2 + 1] = NaN;
        }
    }

    calcColorscales(trace);


    var options = ScatterGl.sceneOptions(container, subplot, trace, positions);


    Axes.expand(radialAxis, rArray, {tozero: true});

    if(angularAxis.type !== 'linear') {
        angularAxis.autorange = true;
        Axes.expand(angularAxis, thetaArray);
    }

    var scene = ScatterGl.scene(container, subplot, trace, positions, options);

    // save scene options batch
    scene.lineOptions.push(options.line);
    scene.errorXOptions.push(options.errorX);
    scene.errorYOptions.push(options.errorY);
    scene.fillOptions.push(options.fill);
    scene.markerOptions.push(options.marker);
    scene.selectedOptions.push(options.selected);
    scene.unselectedOptions.push(options.unselected);
    scene.count++;

    // stash scene ref
    stash.scene = scene;
    stash.index = scene.count - 1;
    stash.x = x;
    stash.y = y;
    stash.rawx = x;
    stash.rawy = y;
    stash.r = rArray;
    stash.theta = thetaArray;
    stash.positions = positions;
    stash.count = count;

    // FIXME: remove this later on once we get rid of .plot wrapper
    stash.container = container;

    // FIXME: delegate this to webworker
    stash.tree = kdtree(positions, 512);
    // var ids = stash.ids = Array(count);
    // for(i = 0; i < count; i++) {
    //     ids[i] = i;
    // }

    return [{x: false, y: false, t: stash, trace: trace}];
}


// FIXME: remove this wrapper once .plot args get consistent order
function plot(plotinfo, cdata) {
    var container = cdata[0][0].t.container;
    return ScatterGl.plot(container, plotinfo, cdata);
}


function hover(pointData, xval, yval, hovermode) {
    var cd = pointData.cd,
        stash = cd[0].t,
        rArray = stash.r,
        thetaArray = stash.theta;

    var scatterPointData = ScatterGl.hoverPoints(pointData, xval, yval, hovermode);

    if(!scatterPointData || scatterPointData[0].index === false) return;

    var newPointData = scatterPointData[0];

    // hovering on fill case
    // TODO do we need to constrain the scatter point data further (like for
    // ternary subplots) or not?
    if(newPointData.index === undefined) {
        return scatterPointData;
    }

    var subplot = pointData.subplot;
    var cdi = newPointData.cd[newPointData.index];

    // augment pointData with r/theta param
    cdi.r = rArray[newPointData.index];
    cdi.theta = thetaArray[newPointData.index];

    if(!subplot.isPtWithinSector(cdi)) return;

    newPointData.xLabelVal = undefined;
    newPointData.yLabelVal = undefined;

    var trace = newPointData.trace;
    var radialAxis = subplot.radialAxis;
    var angularAxis = subplot.angularAxis;
    var hoverinfo = cdi.hi || trace.hoverinfo;
    var parts = hoverinfo.split('+');
    var text = [];
    var rad = angularAxis._c2rad(cdi.theta, trace.thetaunit);

    radialAxis._hovertitle = 'r';
    angularAxis._hovertitle = 'θ';

    // show theta value in unit of angular axis
    var theta;
    if(angularAxis.type === 'linear' && trace.thetaunit !== angularAxis.thetaunit) {
        theta = angularAxis.thetaunit === 'degrees' ? Lib.rad2deg(rad) : rad;
    } else {
        theta = cdi.theta;
    }

    function textPart(ax, val) {
        text.push(ax._hovertitle + ': ' + Axes.tickText(ax, val, 'hover').text);
    }

    if(parts.indexOf('all') !== -1) parts = ['r', 'theta'];
    if(parts.indexOf('r') !== -1) textPart(radialAxis, cdi.r);
    if(parts.indexOf('theta') !== -1) textPart(angularAxis, theta);

    newPointData.extraText = text.join('<br>');

    return scatterPointData;
}


module.exports = {
    moduleType: 'trace',
    name: 'scatterpolargl',
    basePlotModule: require('../../plots/polar'),
    categories: ['gl', 'regl', 'polar', 'symbols', 'markerColorscale', 'showLegend', 'scatter-like'],

    // TODO scatterpolargl won't support text
    // should have its own attributes and defaults
    attributes: require('../scatterpolar/attributes'),
    supplyDefaults: require('../scatterpolar/defaults'),

    calc: calc,
    plot: plot,
    hoverPoints: hover,
    style: ScatterGl.style,
    selectPoints: ScatterGl.selectPoints,

    meta: {
        hrName: 'scatter_polar_gl',
        description: [
            '!!! GL VERSION OF SCATTERPOLAR !!!',

            'The scatterpolar trace type encompasses line charts, scatter charts, text charts, and bubble charts.',
            'in polar coordinates.',
            'The data visualized as scatter point or lines is set in',
            '`r` (radial) and `theta` (angular). coordintes',
            'Text (appearing either on the chart or on hover only) is via `text`.',
            'Bubble charts are achieved by setting `marker.size` and/or `marker.color`',
            'to numerical arrays.'
        ].join(' ')
    }
};