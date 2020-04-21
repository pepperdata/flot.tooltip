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

        var self = this;
        self.$placeholder = plot.getPlaceholder();
        self.plot = plot;

        plot.hooks.bindEvents.push(function (plot, eventHolder) {

            // get plot options
            self.plotOptions = plot.getOptions();

            // if not enabled return
            if (self.plotOptions.tooltip === false || typeof self.plotOptions.tooltip === 'undefined') return;

            // shortcut to access tooltip options
            that.tooltipOptions = that.plotOptions.tooltipOpts;

            // create tooltip DOM element
            var $tip = that.getDomElement();

            // bind event
            $( plot.getPlaceholder() ).bind("plothover", plothover);
            if(self.tooltipOptions.stickyable) {
                $( plot.getPlaceholder() ).bind("plotclick", plotclick);
            }

            $(eventHolder).bind('mousemove', mouseMove);

        });
        plot.hooks.shutdown.push(function (plot, eventHolder){
            $(plot.getPlaceholder()).unbind("plothover", plothover);
            $(plot.getPlaceholder()).unbind("plotclick", plotclick);
            if (self.tooltips[HOVER_TOOLTIP] && self.tooltips[HOVER_TOOLTIP].node) {
                self.tooltips[HOVER_TOOLTIP].node.remove();
                delete self.tooltips[HOVER_TOOLTIP];
            }

            if (self.tooltips[STICKY_TOOLTIP] && self.tooltips[STICKY_TOOLTIP].node) {
                self.tooltips[STICKY_TOOLTIP].node.remove();
                delete self.tooltips[STICKY_TOOLTIP];
            }
            $(eventHolder).unbind("mousemove", mouseMove);
        });
        function mouseMove(e){
            var pos = {};
            pos.x = e.pageX;
            pos.y = e.pageY;
            self.updateTooltipPosition(pos);
        }

        /**
         * Called whenever mouse hovers over a plot, ie, many times
         * @param Object event jQuery event
         * @param Object pos Contains positional (xy) data
         * @param {Object} item Can be null if hovering over empty space. Config for a data point
         */
        function plothover(event, pos, item) {
            if (item) {
                // Don't show a tooltip if hovering over the same one as sticky tooltip
                if (self.tooltips[STICKY_TOOLTIP] && self.tooltips[STICKY_TOOLTIP].item) {
                    const currentData0 = item.datapoint[0];
                    const currentData1 = item.datapoint[1];
                    const stickyData0 = self.tooltips[STICKY_TOOLTIP].item.datapoint[0];
                    const stickyData1 = self.tooltips[STICKY_TOOLTIP].item.datapoint[1];

                    const isHoveringOverStickyDataPoint = currentData0 === stickyData0 &&
                    currentData1 === stickyData1;

                    if (isHoveringOverStickyDataPoint) {
                        hideTooltip(HOVER_TOOLTIP);
                        return;
                    }
                }

                const $tip = self.getDomElement(HOVER_TOOLTIP);
                self.attachTooltipToBody($tip);
                const { tipPosition } = self.tooltips[HOVER_TOOLTIP];

                // convert tooltip content template to real tipText
                const tipText = self.stringFormat(self.tooltipOptions.content, item);

                $tip.html(tipText);
                self.updateTooltipPosition({ x: pos.pageX, y: pos.pageY });
                $tip.css({
                    left: tipPosition.x + self.tooltipOptions.shifts.x,
                    top: tipPosition.y + self.tooltipOptions.shifts.y
                }).show();

                if(typeof self.tooltipOptions.onHover === 'function') {
                    self.tooltipOptions.onHover(item, $tip);
                }
            }
            else {
                // User has hovered off the chart in this case
                hideTooltip(HOVER_TOOLTIP);
            }
        }

        function plotclick(event, pos, item) {
            if(self.tooltipOptions.stickyable) {
                // make a sticky tooltip if none or reassign sticky to new point
                if (item) {
                    if (self.tooltips[STICKY_TOOLTIP] && self.tooltips[STICKY_TOOLTIP].item) {
                        // Check if user is clicking on a sticky point to unstick it
                        const currentData0 = item.datapoint[0];
                        const currentData1 = item.datapoint[1];
                        const stickyData0 = self.tooltips[STICKY_TOOLTIP].item.datapoint[0];
                        const stickyData1 = self.tooltips[STICKY_TOOLTIP].item.datapoint[1];

                        const isClickingOnStickyDataPoint = currentData0 === stickyData0 &&
                        currentData1 === stickyData1;

                        if (isClickingOnStickyDataPoint) {
                            // unsticky
                            const $stickyTooltip = self.getDomElement(STICKY_TOOLTIP);
                            $stickyTooltip.removeClass(self.tooltipOptions.stickyClass);

                            // Remove the dot
                            self.plot.unhighlight(item.seriesIndex, item.dataIndex);

                            // transfer to hover state instead of destroying + recreating
                            const $hoverTooltip = self.getDomElement(HOVER_TOOLTIP);
                            self.tooltips[HOVER_TOOLTIP].node = $stickyTooltip;

                            delete self.tooltips[STICKY_TOOLTIP];

                            if (typeof self.tooltipOptions.onClick === 'function') {
                                self.tooltipOptions.onClick.call(self.plot, item, $hoverTooltip, false);
                            }
                            // Don't try to make a new tooltip if clicking on datapoint to close
                            return;
                        } else {
                            // Use has clicked somewhere else on the graph so hide the current
                            // sticky tooltip before making a new one
                            hideTooltip(STICKY_TOOLTIP);

                        }
                    }

                    // In most cases, there is a tooltip node already attached to the plot since
                    // the user has to hover over the point before clicking, so we reassign it
                    // here instead of making a new one
                    // Then we remove the hover tooltip entry to clean up the internal state
                    // However, there will be no hover tooltip if the user clicks the same point
                    // to unsticky a tooltip since we do not duplicate hovered/sticky tooltips

                    // Simulate a hover to produce a tooltip
                    if (!self.tooltips[HOVER_TOOLTIP]) {
                        plothover(event, pos, item);
                    }

                    self.tooltips[STICKY_TOOLTIP] = self.tooltips[HOVER_TOOLTIP];
                    self.tooltips[STICKY_TOOLTIP].item = item;
                    delete self.tooltips[HOVER_TOOLTIP];

                    // Need this delay to allow hideTooltip call above to unhighlight the series
                    // This allows the dot marking the sticky tooltip datapoint to render
                    window.setTimeout(() => {
                        self.plot.highlight(item.seriesIndex, item.dataIndex);
                    }, 0);

                    const $tip = self.tooltips[STICKY_TOOLTIP].node;
                    $tip.addClass(self.tooltipOptions.stickyClass);
                    if (typeof self.tooltipOptions.onClick === 'function') {
                        self.tooltipOptions.onClick.call(self.plot, item, $tip, true);
                    }
                } else {
                    // make unsticky when user clicks on blank area of chart
                    hideTooltip(STICKY_TOOLTIP);
                    const $tip = self.getDomElement(STICKY_TOOLTIP);
                    $tip.removeClass(self.tooltipOptions.stickyClass);
                    if (typeof self.tooltipOptions.onClick === 'function') {
                        self.tooltipOptions.onClick.call(self.plot, item, $tip, false);
                    }
                }
            }

            self.lastClickTimeStamp = event.timeStamp;
        }
        /**
         * Removes tooltip element and also deletes entry from internal state
         * @param String type of tooltip - STICKY_TOOLTIP or HOVER_TOOLTIP
         */
        function hideTooltip(tooltipType) {
            const $tip = self.getDomElement(tooltipType);

            self.detachTooltipFromBody($tip);
            if(tooltipType === STICKY_TOOLTIP) {
                const stickyItem = self.tooltips[STICKY_TOOLTIP].item;
                if (stickyItem) {
                    self.plot.unhighlight(stickyItem.seriesIndex, stickyItem.dataIndex);
                }
            }

            delete self.tooltips[tooltipType];
        }

        // add public functions
        self.plot.plotTooltip = { hideTooltip: hideTooltip };
    };

    FlotTooltip.prototype.makeTooltipNode = function() {
        const self = this;
        const $tooltipNode = $('<div />').attr('class', 'flotTip');
        $tooltipNode.data("plot", self.plot); // store what plot this is for

        if(self.tooltipOptions.defaultTheme) {
            $tooltipNode.css({
                'background': '#fff',
                'z-index': '100',
                'padding': '0.4em 0.6em',
                'border-radius': '0.5em',
                'font-size': '0.8em',
                'border': '1px solid #111',
                'display': 'none',
                'white-space': 'nowrap'
            });
        }
        return $tooltipNode;
    };

    FlotTooltip.prototype.attachTooltipToBody = function ($tooltipNode) {
        const flottipContainerId = "flotTips";
        let $flotTipContainer = $("#" + flottipContainerId);
        if ($flotTipContainer.length === 0) {
            $flotTipContainer = $("<div />").attr('id', flottipContainerId).appendTo('body');
        }
        $tooltipNode.appendTo($flotTipContainer).hide().css({position: 'absolute'});
    };

    FlotTooltip.prototype.detachTooltipFromBody = function ($tooltipNode) {
        const flottipContainerId = "flotTips";
        let $flotTipContainer = $("#" + flottipContainerId);
        if ($flotTipContainer.length === 0) {
            return;
        }
        $tooltipNode.detach();
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

    FlotTooltip.prototype.updateTooltipPosition = function(pos) {
        const self = this;
        const tooltipCount = Object.keys(self.tooltips).length;

        if (tooltipCount === 0) {
            return;
        }
        // Sticky tooltips should never move so only update hovering ones
        var $tip = self.getDomElement(HOVER_TOOLTIP);
        var totalTipWidth = $tip.outerWidth() + this.tooltipOptions.shifts.x;
        var totalTipHeight = $tip.outerHeight() + this.tooltipOptions.shifts.y;
        if ((pos.x - $(window).scrollLeft()) > ($(window).innerWidth() - totalTipWidth)) {
            pos.x -= totalTipWidth;
        }
        if ((pos.y - $(window).scrollTop()) > ($(window).innerHeight() - totalTipHeight)) {
            pos.y -= totalTipHeight;
        }
        self.tooltips[HOVER_TOOLTIP].tipPosition.x = pos.x;
        self.tooltips[HOVER_TOOLTIP].tipPosition.y = pos.y;
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
