/**
 * 数据伺服
 */

import {
    makeApiRequest,
    generateSymbol,
    parseFullSymbol,
} from './helpers.js';
import {
    subscribeOnStream,
    unsubscribeFromStream,
} from './streaming.js';

const lastBarsCache = new Map();

// 图表配置
const configurationData = {
    //数据颗粒度
    supported_resolutions: ['1D', '1W', '1M'],
    exchanges: [{
        value: 'Bitfinex',
        name: 'Bitfinex',
        desc: 'Bitfinex',
    },
        {
            // `exchange` argument for the `searchSymbols` method, if a user selects this exchange
            value: 'Kraken',

            // filter name
            name: 'Kraken',

            // full exchange name displayed in the filter popup
            desc: 'Kraken bitcoin exchange',
        },
    ],
    symbols_types: [{
        name: 'crypto',

        // `symbolType` argument for the `searchSymbols` method, if a user selects this symbol type
        value: 'crypto',
    },
        // ...
    ],
};

// 从api获取所有 symbols
async function getAllSymbols() {
    // 所有交易所
    const data = await makeApiRequest('data/v3/all/exchanges');
    let allSymbols = [];

    for (const exchange of configurationData.exchanges) {
        // 取出配置交易所中的交易对
    const pairs = data.Data[exchange.value].pairs;

        // 
        for (const leftPairPart of Object.keys(pairs)) {
            const symbols = pairs[leftPairPart].map(rightPairPart => {
                // 将交易对转换为 symbol: Bitfinex:   BTC          /             USD
                const symbol = generateSymbol(exchange.value, leftPairPart, rightPairPart);
                return {
                    symbol: symbol.short,//btc/usd
                    full_name: symbol.full, //Bitfinex:BTC/USD
                    description: symbol.short, //btc/usd
                    exchange: exchange.value,   //Bitfinex
                    type: 'crypto',
                };
            });
            allSymbols = [...allSymbols, ...symbols];
        }
    }
    return allSymbols;
}

export default {
    onReady: (callback) => {
        console.log('[onReady]: Method call');
        //需要是异步的
        setTimeout(() => callback(configurationData));
    },

    /**
     * 用户输入搜索时的回调
     * @param userInput 用户输入的搜索字符串
     * @param exchange  交易所
     * @param symbolType    商品类型 configurationData.symbols_types[]中的元素
     * @param onResultReadyCallback
     * @returns {Promise<void>}
     */
    searchSymbols: async (
        userInput,
        exchange,
        symbolType,
        onResultReadyCallback,
    ) => {
        console.log('[searchSymbols]: Method call');
        const symbols = await getAllSymbols();
        const newSymbols = symbols.filter(symbol => {
            const isExchangeValid = exchange === '' || symbol.exchange === exchange;
            const isFullSymbolContainsInput = symbol.full_name
                .toLowerCase()
                .indexOf(userInput.toLowerCase()) !== -1;
            return isExchangeValid && isFullSymbolContainsInput;
        });
        /**
         *
         * newSymbols 元素结构
         * {
         *         "symbol": "<short symbol name>",
         *         "full_name": "<full symbol name>", // e.g. BTCE:BTCUSD
         *         "description": "<symbol description>",
         *         "exchange": "<symbol exchange name>",
         *         "ticker": "<symbol ticker name, optional>",
         *         "type": "stock" // or "futures" or "crypto" or "forex" or "index"
         *  }
         */
        onResultReadyCallback(newSymbols);
    },

    //用选择的symbol 从api获取symbol信息
    resolveSymbol: async (
        symbolName,
        onSymbolResolvedCallback,
        onResolveErrorCallback,
    ) => {
        console.log('[resolveSymbol]: Method call', symbolName);
        const symbols = await getAllSymbols();
        const symbolItem = symbols.find(({
                                             full_name,
                                         }) => full_name === symbolName);
        if (!symbolItem) {
            console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
            onResolveErrorCallback('cannot resolve symbol');
            return;
        }
        const symbolInfo = {
            ticker: symbolItem.full_name, //  唯一标识符，如果没有会使用name
            name: symbolItem.symbol,       //  币种名称
            description: symbolItem.description, //  币种描述
            type: symbolItem.type,  // 图标类型
            session: '24x7',
            timezone: 'Etc/UTC',  // 时区Asia/Hong_Kong
            exchange: symbolItem.exchange,  //交易所简称
            minmov: 1,       // 最小交易量
            pricescale: 100,  // 价格精度
            has_intraday: false,  // 是否支持分时图
            has_no_volume: true, // 是否支持成交量
            has_weekly_and_monthly: false, // 是否支持周和月
            supported_resolutions: configurationData.supported_resolutions, // 支持的分辨率
            volume_precision: 2, // 成交量精度
            data_status: 'streaming', // 数据状态, 显示在图表右上角
        };

        console.log('[resolveSymbol]: Symbol resolved', symbolName);
        onSymbolResolvedCallback(symbolInfo);
    },
    
    /**
     *  获取指定交易对的历史数据
     * @param {*} symbolInfo 交易对信息
     * @param {*} resolution 分辨率,日, 月, 年等等
     * @param {*} periodParams  周期参数, 包含以下字段: 
     * from:unix 时间戳, 开始时间, 包含
     * countBack: 需要加载的bars确切数量(如果api支持), 如果用户指定特定时间段, 则可能没有.
     * to: unix 时间戳, 结束时间, 不包含
     * firstDataRequest 是否第一次请求数据, 如果是, 你可以忽略to参数而返回最新的数据
     * @param {*} onHistoryCallback 接收两个参数:
     * bars: 数据数组, 每个元素是一个对象, 包含以下字段:
     * {time: unix 时间戳,
     * open: 开盘价,
     * high: 最高价,
     * low: 最低价,
     * close: 收盘价,
     * volume: 成交量
     * }
     * 
     * information: 
     * {
     * noData: 是否没有数据,
     * nextTime: 下一个数据的时间戳,
     * }
     * @param {*} onErrorCallback 
     * @returns 
     */
    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        const { from, to, firstDataRequest } = periodParams;
        console.log('[getBars]: Method call', symbolInfo, resolution, from, to);
        debugger
        const parsedSymbol = parseFullSymbol(symbolInfo.full_name);
        const urlParameters = {
            e: parsedSymbol.exchange,
            fsym: parsedSymbol.fromSymbol,
            tsym: parsedSymbol.toSymbol,
            toTs: to,
            limit: 2000,
        };
        const query = Object.keys(urlParameters)
            .map(name => `${name}=${encodeURIComponent(urlParameters[name])}`)
            .join('&');
        try {
            const data = await makeApiRequest(`data/histoday?${query}`);
            if (data.Response && data.Response === 'Error' || data.Data.length === 0) {
                // "noData" should be set if there is no data in the requested period.
                onHistoryCallback([], {
                    noData: true,
                });
                return;
            }
            let bars = [];
            data.Data.forEach(bar => {
                if (bar.time >= from && bar.time < to) {
                    bars = [...bars, {
                        time: bar.time * 1000,
                        low: bar.low,
                        high: bar.high,
                        open: bar.open,
                        close: bar.close,
                    }];
                }
            });
            if (firstDataRequest) {
                lastBarsCache.set(symbolInfo.full_name, {
                    ...bars[bars.length - 1],
                });
            }
            console.log(`[getBars]: returned ${bars.length} bar(s)`);
            onHistoryCallback(bars, {
                noData: false,
            });
        } catch (error) {
            console.log('[getBars]: Get error', error);
            onErrorCallback(error);
        }
    },

    subscribeBars: (
        symbolInfo,
        resolution,
        onRealtimeCallback,
        subscribeUID,
        onResetCacheNeededCallback,
    ) => {
        console.log('[subscribeBars]: Method call with subscribeUID:', subscribeUID);
        subscribeOnStream(
            symbolInfo,
            resolution,
            onRealtimeCallback,
            subscribeUID,
            onResetCacheNeededCallback,
            lastBarsCache.get(symbolInfo.full_name),
        );
    },

    unsubscribeBars: (subscriberUID) => {
        console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
        unsubscribeFromStream(subscriberUID);
    },
};
