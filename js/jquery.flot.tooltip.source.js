(function ($) {

    const HOVER_TOOLTIP = 'hoverTooltip';
    const STICKY_TOOLTIP = 'stickyTooltip';

    // plugin options, default values
    var defaultOptions = {
        tooltip: false,
        tooltipOpts: {
            content: "%s | X: %x | Y: %y",
            // allowed templates are:
            // %s -> series label,
            // %x -> X value,
            // %y -> Y value,
            // %x.2 -> precision of X value,
            // %p -> percent
            xDateFormat: null,
            yDateFormat: null,
            shifts: {
                x: 10,
                y: 20
            },
            defaultTheme: true,
            stickyable: false,
            stickyClass: 'flotTipSticky',

            // callbacks
            onHover: function(flotItem, $tooltipEl) {},
            onClick: function(flotItem, $tooltipEl, isSticky) {}
        }
    };

    // object
    var FlotTooltip = function(plot) {

        // NOTE (phvc): Assumptions made in code for max of two tooltips
        // { HOVER_TOOLTIP: {}, STICKY_TOOLTIP: {} }
        // Each value has shape:
        // {
        //     tipPosition: {
        //         x: Number,
        //         y: Number,
        //     },
        //     node: $('<div />')
        //             .attr('class', 'flotTip')
        //             .attr('id', flottipContainerId)
        //             .data("plot", this.plot)
        // }
        // STICKY_TOOLTIP has an additional key `item` containing data about the locked data point
        // item: {}
        this.tooltips = {};

        this.init(plot);
    };

    // main plugin function
    FlotTooltip.prototype.init = function(plot) {

        var that = this;
        that.$placeholder = plot.getPlaceholder();
        that.plot = plot;

        plot.hooks.bindEvents.push(function (plot, eventHolder) {

            // get plot options
            that.plotOptions = plot.getOptions();

            // if not enabled return
            if (that.plotOptions.tooltip === false || typeof that.plotOptions.tooltip === 'undefined') return;

            // shortcut to access tooltip options
            that.tooltipOptions = that.plotOptions.tooltipOpts;

            // create tooltip DOM element
            var $tip = that.getDomElement();

            // bind event
            $( plot.getPlaceholder() ).bind("plothover", plothover);
            if(that.tooltipOptions.stickyable) {
                $( plot.getPlaceholder() ).bind("plotclick", plotclick);
            }

            $(eventHolder).bind('mousemove', mouseMove);

        });
        plot.hooks.shutdown.push(function (plot, eventHolder){
            $(plot.getPlaceholder()).unbind("plothover", plothover);
            $(plot.getPlaceholder()).unbind("plotclick", plotclick);
            that.getDomElement().remove();
            $(eventHolder).unbind("mousemove", mouseMove);
        });
        function mouseMove(e){
            var pos = {};
            pos.x = e.pageX;
            pos.y = e.pageY;
            that.updateTooltipPosition(pos);
        }

        function plothover(event, pos, item) {
            if(!that.stickyItem)
            {
                var $tip = that.getDomElement();
                if (item) {
                    var tipText;

                    // convert tooltip content template to real tipText
                    tipText = that.stringFormat(that.tooltipOptions.content, item);

                    $tip.html( tipText );
                    that.updateTooltipPosition({ x: pos.pageX, y: pos.pageY });
                    $tip.css({
                        left: that.tipPosition.x + that.tooltipOptions.shifts.x,
                        top: that.tipPosition.y + that.tooltipOptions.shifts.y
                    }).show();

                    // run callback
                    if(typeof that.tooltipOptions.onHover === 'function') {
                        that.tooltipOptions.onHover(item, $tip);
                    }
                }
                else {
                    hideTooltip();
                }
            }
        }

        function plotclick(event, pos, item) {
            var $tip = that.getDomElement();
            if(that.tooltipOptions.stickyable) {
                if(item && !that.stickyItem) {
                    // make sticky
                    that.stickyItem = item;
                    that.plot.highlight(item.seriesIndex, item.dataIndex);
                    $tip.addClass(that.tooltipOptions.stickyClass);
                    if (typeof that.tooltipOptions.onClick === 'function') {
                        that.tooltipOptions.onClick.call(that.plot, item, $tip, true);
                    }
                } else {
                    // make unsticky
                    hideTooltip();
                    plothover(event, pos, item);
                    $tip.removeClass(that.tooltipOptions.stickyClass);
                    if (typeof that.tooltipOptions.onClick === 'function') {
                        that.tooltipOptions.onClick.call(that.plot, item, $tip, false);
                    }
                }
            }

            that.lastClickTimeStamp = event.timeStamp;
        }

        function hideTooltip() {
            var $tip = that.getDomElement();
            $tip.hide().html('').removeClass(that.tooltipOptions.stickyClass);
            if(that.stickyItem) {
                that.plot.unhighlight(that.stickyItem.seriesIndex, that.stickyItem.dataIndex);
                that.stickyItem = null;
            }
        }

        // add public functions
        that.plot.plotTooltip = { hideTooltip: hideTooltip };
    };

    /**
     * Get or create tooltip DOM element.
     * If the tooltipType is not already present, creates matching one and updates internal state
     * Any logic for showing/hiding tooltips should be done outside of this function
     * @param String tooltipType of the node
     * @return jQuery object
     */
    FlotTooltip.prototype.getDomElement = function(tooltipType) {
        const self = this;
        let $tooltipNode;
        if (self.tooltips[tooltipType]) {
            $tooltipNode = self.tooltips[tooltipType].node;
        } else {
            $tooltipNode = self.makeTooltipNode(tooltipType);

            // Update internal state
            self.tooltips[tooltipType] = {
                tipPosition: {},
                node: $tooltipNode,
            };
        }

        return $tooltipNode;
    };

    // as the name says
    FlotTooltip.prototype.updateTooltipPosition = function(pos) {
        var $tip = this.getDomElement();
        var totalTipWidth = $tip.outerWidth() + this.tooltipOptions.shifts.x;
        var totalTipHeight = $tip.outerHeight() + this.tooltipOptions.shifts.y;
        if ((pos.x - $(window).scrollLeft()) > ($(window).innerWidth() - totalTipWidth)) {
            pos.x -= totalTipWidth;
        }
        if ((pos.y - $(window).scrollTop()) > ($(window).innerHeight() - totalTipHeight)) {
            pos.y -= totalTipHeight;
        }
        this.tipPosition.x = pos.x;
        this.tipPosition.y = pos.y;
    };

    /**
     * core function, create tooltip content
     * @param  {string} content - template with tooltip content
     * @param  {object} item - Flot item
     * @return {string} real tooltip content for current item
     */
    FlotTooltip.prototype.stringFormat = function(content, item) {

        var percentPattern = /%p\.{0,1}(\d{0,})/;
        var seriesPattern = /%s/;
        var xPattern = /%x\.{0,1}(?:\d{0,})/;
        var yPattern = /%y\.{0,1}(?:\d{0,})/;

        var x = item.datapoint[0];
        var y = item.datapoint[1];

        // if it is a function callback get the content string
        if( typeof(content) === 'function' ) {
            content = content(item.series.label, x, y, item, this.plot);
        }

        // percent match for pie charts
        if( typeof (item.series.percent) !== 'undefined' ) {
            content = this.adjustValPrecision(percentPattern, content, item.series.percent);
        }

        // series match
        if( typeof(item.series.label) !== 'undefined' ) {
            content = content.replace(seriesPattern, item.series.label);
        }

        // time mode axes with custom dateFormat
        if(this.isTimeMode('xaxis', item) && this.isXDateFormat(item)) {
            content = content.replace(xPattern, this.timestampToDate(x, this.tooltipOptions.xDateFormat));
        }

        if(this.isTimeMode('yaxis', item) && this.isYDateFormat(item)) {
            content = content.replace(yPattern, this.timestampToDate(y, this.tooltipOptions.yDateFormat));
        }

        // set precision if defined
        if( typeof x === 'number' ) {
            content = this.adjustValPrecision(xPattern, content, x);
        }
        if( typeof y === 'number' ) {
            content = this.adjustValPrecision(yPattern, content, y);
        }

        // if no value customization, use tickFormatter by default
        if(typeof item.series.xaxis.tickFormatter !== 'undefined') {
            content = content.replace(xPattern, item.series.xaxis.tickFormatter(x, item.series.xaxis));
        }
        if(typeof item.series.yaxis.tickFormatter !== 'undefined') {
            content = content.replace(yPattern, item.series.yaxis.tickFormatter(y, item.series.yaxis));
        }

        return content;
    };

    // helpers just for readability
    FlotTooltip.prototype.isTimeMode = function(axisName, item) {
        return (typeof item.series[axisName].options.mode !== 'undefined' && item.series[axisName].options.mode === 'time');
    };

    FlotTooltip.prototype.isXDateFormat = function(item) {
        return (typeof this.tooltipOptions.xDateFormat !== 'undefined' && this.tooltipOptions.xDateFormat !== null);
    };

    FlotTooltip.prototype.isYDateFormat = function(item) {
        return (typeof this.tooltipOptions.yDateFormat !== 'undefined' && this.tooltipOptions.yDateFormat !== null);
    };

    //
    FlotTooltip.prototype.timestampToDate = function(tmst, dateFormat) {
        var theDate = new Date(tmst);
        return $.plot.formatDate(theDate, dateFormat);
    };

    //
    FlotTooltip.prototype.adjustValPrecision = function(pattern, content, value) {

        var precision;
        var matchResult = content.match(pattern);
        if( matchResult !== null ) {
            if(RegExp.$1 !== '') {
                precision = RegExp.$1;
                value = value.toFixed(precision);

                // only replace content if precision exists, in other case use thickformater
                content = content.replace(pattern, value);
            }
        }
        return content;
    };

    //
    var init = function(plot) {
      new FlotTooltip(plot);
    };

    // define Flot plugin
    $.plot.plugins.push({
        init: init,
        options: defaultOptions,
        name: 'tooltip',
        version: '0.6.1'
    });

})(jQuery);
