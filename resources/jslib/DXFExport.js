OpenLayers.Control.DXFExport = OpenLayers.Class(OpenLayers.Control, {
    //type: OpenLayers.Control.TYPE_TOGGLE,
    formId: null, //id del form di stampa
    loadingControl: null,
    baseUrl:null,
    offsetLeft:0, //pannelli che se aperti riducono l'area della mappa
    offsetRight:0,
    offsetTop:0,
    offsetBottom:0,
    margin: 25,
    boxScale:null,
    printDate:null,
    layerBox:null,
    allowDrag:false,
    allowResize:true,
    allowRotation:false,
    autoCenter:false,
    styleBox:null,
    defaultLayers: [],
    waitFor: undefined,//se il pannello viene caricato async, il tool aspetta il caricamento prima di far partire la richiesta per il box
	initialBBEdge: 100,
	maxArea: clientConfig.DXF_MAX_AREA, //mq di area massima estraibile

    EVENT_TYPES: ["activate","deactivate","panelready","updateboxInfo","exported"],

    pages: null,

    initialize: function(options) {
        OpenLayers.Control.prototype.initialize.apply(this, arguments);
    },
    setMap: function(map) {
        //si pu� spostare in initialize quando togliamo i parametri che dipendono da map
        var me = this;
        OpenLayers.Control.prototype.setMap.apply(me, arguments);
        if(!me.loadingControl) {
            var query = me.map.getControlsByClass('OpenLayers.Control.LoadingPanel');
            if(query.length) me.loadingControl = query[0];
        }

        this.layerbox = new OpenLayers.Layer.Vector("LayerBox",{styleMap:me.styleBox});
        this.map.addLayer(this.layerbox);

        if(this.allowDrag || this.allowResize || this.allowRotate){
            this.modifyControl = new OpenLayers.Control.ModifyFeature(this.layerbox);
            this.map.addControl(this.modifyControl);
            this.layerbox.events.register('featuremodified', this, this.boxModify);
        }

		//controllo per nascondere il bottone
		map.events.register('zoomend', null, function(){
			var zoom = map.getZoom();
			if(!sidebarPanel.isOpened){
				if(zoom >= 9){
					$("a[title=\"Esporta DXF\"]").css("display", "block");

				}else{
					$("a[title=\"Esporta DXF\"]").css("display", "none");
				}
			}
		});
    },

    getParams: function() {
        var self = this;
        var size  = this.map.getCurrentSize();
        var center = this.map.getCenter();
        var copyrightString = null;
        var searchControl = this.map.getControlsByClass('OpenLayers.Control.Attribution');
        if(searchControl.length > 0) {
            copyrightString = searchControl[0].div.innerText;
        }

        var srid;
        var extent = this.map.calculateBounds();
        if (this.map.displayProjection && this.map.displayProjection != this.map.projection) {
            var projCOK = new OpenLayers.Projection(this.map.displayProjection);
            center.transform(this.map.getProjectionObject(), projCOK);
            extent.transform(this.map.getProjectionObject(), projCOK);
            srid = this.map.displayProjection;
        }
        else {
            srid = this.map.getProjection();
        }
        if(srid == 'EPSG:900913') srid = 'EPSG:3857';

        params = {
            viewport_size: [size.w, size.h],
            center: [center.lon, center.lat],
            srid: srid,
            copyrightString: copyrightString,
            extent: extent.toBBOX() //Non serve ma me lo chiede da vedere
        }

        return params;
    },



    boxModify: function(e){

        var bounds = e.feature.geometry.getBounds();
		//calcoli in metri. Sul sistema 3857 sarebbe da rivedere
		//devo limitare l'area di definizione
		var area = (bounds.right - bounds.left) * (bounds.top - bounds.bottom);
        if( area > this.maxArea) {
			area = this.maxArea;
			var maxBBEdge = Math.sqrt(this.maxArea);
			var bounds = this.exportBox.geometry.getBounds();
			var center = bounds.getCenterLonLat();
			var newBounds;
			//if (this.map.displayProjection && this.map.displayProjection != this.map.projection) {
			//	var projCOK = new OpenLayers.Projection(this.map.displayProjection);
			//	center.transform(this.map.getProjectionObject(), projCOK);
			//	newBounds = new OpenLayers.Bounds(center.lon - maxBBEdge/2, center.lat - maxBBEdge/2, center.lon + maxBBEdge/2,  center.lat + maxBBEdge/2);
			//	newBounds.transform(projCOK, this.map.getProjectionObject());
			//}
			//else {
				newBounds = new OpenLayers.Bounds(center.lon - maxBBEdge/2, center.lat - maxBBEdge/2, center.lon + maxBBEdge/2,  center.lat + maxBBEdge/2);
			//}
			//????????????????????????????????????????? non aggiorna
			//NON RIESCO A MODIFICARE LA FEATURE. QUINDI LA TOLGO E LA RIAGGIUNGO POI VEDIAMO
			if (this.modifyControl)
				if(this.modifyControl.feature)
					this.modifyControl.unselectFeature(this.exportBox);
			this.exportBox.destroy();
			this.exportBox = new OpenLayers.Feature.Vector(newBounds.toGeometry());
			this.layerbox.addFeatures(this.exportBox);
        }
		this.updateUrl();
        $("#exportAreaSize").html(Math.round(area) + " mq");
		this.events.triggerEvent("updateboxInfo");
    },

	updateUrl: function(){
		var me = this;
		var params = me.getParams();
		//params["tiles"] = me.getTiles();
		//params["format"] = me.printFormat;
		var bounds = me.exportBox.geometry.getBounds().clone();;
		if (this.map.displayProjection && this.map.displayProjection != this.map.projection) {
		var projCOK = new OpenLayers.Projection(this.map.displayProjection);
		bounds.transform(this.map.getProjectionObject(), projCOK);
		}
		//definisco il BB da estrarre
		var center = bounds.getCenterLonLat();
		var width = bounds.getWidth();
		var height = bounds.getHeight();
		params["center"] = [center.lon, center.lat];
		params["extent"] = [center.lon-width/2,center.lat-height/2,center.lon+width/2,center.lat+height/2].join(",");
		params = {};
		params.project = "geoweb_iren";
		var mapSetThemes = $('.dxfexport_themes:checked').map(function() {return this.value;}).get().join(';');
		if(!mapSetThemes){
			alert("Selezionare almeno un tema.");
			//seleziono il primo tema
			$('.dxfexport_themes').first().prop('checked', true);
			return;
		}
		//ricavo i temi/mapset
		var mapSetThemes = mapSetThemes.split(';');
		var themes = new Array();
		var mapSet = new Array();
		for(var i = 0; i < mapSetThemes.length; i++){
				var mapSetTheme = mapSetThemes[i].split(',');
				mapSet.push(mapSetTheme[0]);
				for(var k = 1; k < mapSetTheme.length; k++){		
					themes.push(mapSetTheme[k]);
				}
		}
		//setto i parametri
		params.themes = themes.join();
		params.mapset = mapSet.join();
		params.epsg = clientConfig.DXF_EPSG;
		params.template = clientConfig.DXF_TEMPLATE;
		params.miny = center.lat-height/2;
		params.maxy = center.lat+height/2;
		params.minx = center.lon-width/2;
		params.maxx = center.lon+width/2;
		
		//parametri avanzati
		params.enableTemplateLayer = document.getElementById('enableTemplateLayer').checked ? 1 : 0;
		params.enableColors = document.getElementById('enableColors').checked ? 0 : 1;
		params.enableLineThickness =  document.getElementById('enableLineThickness').checked ? 0 : 1;
		var textScaleMultiplier = document.getElementById('textScaleMultiplier');
		if(textScaleMultiplier.value)
			params.textScaleMultiplier = textScaleMultiplier.value;
		var labelScaleMultiplier = document.getElementById('labelScaleMultiplier');
		if(labelScaleMultiplier.value)
			params.labelScaleMultiplier = labelScaleMultiplier.value;
		var insertScaleMultiplier = document.getElementById('insertScaleMultiplier');
		if(insertScaleMultiplier.value)
			params.insertScaleMultiplier = insertScaleMultiplier.value;
		
		//Aggiorno il link per il download
		var url = clientConfig.DXF_SERVICE_URL + 'services/plugins/dxfexport/gcExportService.php?' + $.param(params);
		$("#hdnExportDxfUrl").val(url);

	},
    activate: function() {
        var activated = OpenLayers.Control.prototype.activate.call(this);
        if(activated) {
            //.................

        }
    },

    updateMode: function(){
        this.modifyControl.mode = 0;
        if (this.allowDrag) this.modifyControl.mode |= OpenLayers.Control.ModifyFeature.DRAG;
        if (this.allowResize) this.modifyControl.mode |=  OpenLayers.Control.ModifyFeature.RESIZE;
        if (this.allowRotation) this.modifyControl.mode |= OpenLayers.Control.ModifyFeature.ROTATE;
    },

    drawExportBox: function() {
        var self = this;
        //calcolo l'area libera per il box di esportazione in metri
        var boxW = this.initialBBEdge; //metri
        var boxH = this.initialBBEdge; //metri

        var centerWPix = parseInt((this.map.size.w)/2);
        var centerHPix = parseInt((this.map.size.h)/2);
        var ct = this.map.getLonLatFromPixel(new OpenLayers.Pixel(centerWPix, centerHPix));
        var bounds = new OpenLayers.Bounds(ct.lon - (boxW/2), ct.lat - (boxH/2), ct.lon + (boxW/2), ct.lat + (boxW/2));
		
        this.geometryBox = bounds.toGeometry();
        this.originalBounds = bounds.clone();
        this.exportBox = new OpenLayers.Feature.Vector(bounds.toGeometry());
        this.layerbox.addFeatures(this.exportBox);
        if(this.allowDrag || this.allowResize || this.allowRotate){
            this.updateMode();
            this.modifyControl.pageRotation = 0;

            this.origLayerIndex = this.map.getLayerIndex(this.layerbox);
            var maxIndex = this.map.getLayerIndex(this.map.layers[this.map.layers.length -1]);
            if(this.origLayerIndex < maxIndex) this.map.raiseLayer(this.layerbox, (maxIndex - this.origLayerIndex));
            this.map.resetLayersZIndex();
            this.modifyControl.activate();
        }

        var map = this.map;
		var area = (bounds.right - bounds.left) * (bounds.top - bounds.bottom);
		$("#exportAreaSize").html(Math.round(area) + " mq");
        map.events.register("moveend", map, function(){
            if(self.autoCenter) self.moveExportBox(map.getCenter());
        });



    },

    moveExportBox: function(position){
        //if(!this.editMode) return;
        if(this.modifyControl && this.modifyControl.feature) this.modifyControl.unselectFeature(this.exportBox);
        this.exportBox.move(position);
        this.events.triggerEvent("updateboxInfo");

    },

    removeExportBox: function(){
        if (this.modifyControl) {
            if(this.modifyControl.feature)
                this.modifyControl.unselectFeature(this.exportBox);
            this.modifyControl.deactivate();
            this.map.setLayerIndex(this.layerbox, this.origLayerIndex);
            this.map.resetLayersZIndex();
        }
        if (this.exportBox)
            this.exportBox.destroy();
    },

    getBounds: function(){
        return this.exportBox.geometry.getBounds();

    },

	 roundScale: function(scale){
        // if(scale > 1000000)
        //     scale = Math.ceil(scale/1000000) * 1000000;
        // else if(scale > 10000)
        //     scale = Math.ceil(scale/10000) * 10000;
        // else if(scale > 1000)
        //     scale = Math.ceil(scale/1000) * 1000;
        // else if(scale > 100)

        scale = Math.ceil(scale/100) * 100;
        return scale;
    },

	 downloadDXF: function(){

		var me = this;
		if(me.loadingControl) me.loadingControl.maximizeControl();
		 $.ajax({
			type: "GET",
			dataType: "json",
			url: $("#hdnExportDxfUrl").val(),
			headers: {
				Accept: 'application/json',
			}
		}).done(function (res) {

			if(me.loadingControl) me.loadingControl.minimizeControl();
			const a = document.createElement('a');
			a.style = 'display: none';
			document.body.appendChild(a);
			//const blob = new Blob([res], {type: 'octet/stream'});
			//const url = URL.createObjectURL(blob);
			a.href = clientConfig.DXF_DOWNLOAD_URL + res.fileName;
			a.download = res.fileName;
			a.click();
			//URL.revokeObjectURL(url);
		}).fail(function (err) {
			alert("Si � verificato un errore nell'estrazione dei dati. Si consiglia di limitare i temi estratti o ridurre l'area di selezione. Se il problema persiste contattare gli amministratori.");
		});

	}

});

//TODO Eliminare in favore di un evento sul pannello
setTimeout(function(){
	$("a[title=\"Esporta DXF\"]").css("display", "none");
}, 2000);
