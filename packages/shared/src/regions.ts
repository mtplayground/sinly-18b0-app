export interface ChinaCounty {
  code: string;
  name: string;
}

export interface ChinaCity {
  code: string;
  name: string;
  counties: readonly ChinaCounty[];
}

export interface ChinaProvince {
  code: string;
  name: string;
  cities: readonly ChinaCity[];
}

export interface RegionSelection {
  province: ChinaProvince;
  city: ChinaCity;
  county: ChinaCounty;
}

export const chinaRegions: readonly ChinaProvince[] = [
  {
    code: "110000",
    name: "北京市",
    cities: [
      {
        code: "110100",
        name: "北京市",
        counties: [
          { code: "110101", name: "东城区" },
          { code: "110102", name: "西城区" },
          { code: "110105", name: "朝阳区" },
          { code: "110108", name: "海淀区" },
          { code: "110115", name: "大兴区" },
        ],
      },
    ],
  },
  {
    code: "120000",
    name: "天津市",
    cities: [
      {
        code: "120100",
        name: "天津市",
        counties: [
          { code: "120101", name: "和平区" },
          { code: "120102", name: "河东区" },
          { code: "120103", name: "河西区" },
          { code: "120110", name: "东丽区" },
          { code: "120116", name: "滨海新区" },
        ],
      },
    ],
  },
  {
    code: "130000",
    name: "河北省",
    cities: [
      {
        code: "130100",
        name: "石家庄市",
        counties: [
          { code: "130102", name: "长安区" },
          { code: "130104", name: "桥西区" },
          { code: "130121", name: "井陉县" },
        ],
      },
      {
        code: "130200",
        name: "唐山市",
        counties: [
          { code: "130202", name: "路南区" },
          { code: "130203", name: "路北区" },
          { code: "130224", name: "滦南县" },
        ],
      },
    ],
  },
  {
    code: "140000",
    name: "山西省",
    cities: [
      {
        code: "140100",
        name: "太原市",
        counties: [
          { code: "140105", name: "小店区" },
          { code: "140106", name: "迎泽区" },
          { code: "140121", name: "清徐县" },
        ],
      },
      {
        code: "140200",
        name: "大同市",
        counties: [
          { code: "140213", name: "平城区" },
          { code: "140214", name: "云冈区" },
          { code: "140221", name: "阳高县" },
        ],
      },
    ],
  },
  {
    code: "150000",
    name: "内蒙古自治区",
    cities: [
      {
        code: "150100",
        name: "呼和浩特市",
        counties: [
          { code: "150102", name: "新城区" },
          { code: "150103", name: "回民区" },
          { code: "150121", name: "土默特左旗" },
        ],
      },
      {
        code: "150200",
        name: "包头市",
        counties: [
          { code: "150202", name: "东河区" },
          { code: "150203", name: "昆都仑区" },
          { code: "150222", name: "固阳县" },
        ],
      },
    ],
  },
  {
    code: "210000",
    name: "辽宁省",
    cities: [
      {
        code: "210100",
        name: "沈阳市",
        counties: [
          { code: "210102", name: "和平区" },
          { code: "210103", name: "沈河区" },
          { code: "210113", name: "沈北新区" },
        ],
      },
      {
        code: "210200",
        name: "大连市",
        counties: [
          { code: "210202", name: "中山区" },
          { code: "210211", name: "甘井子区" },
          { code: "210281", name: "瓦房店市" },
        ],
      },
    ],
  },
  {
    code: "220000",
    name: "吉林省",
    cities: [
      {
        code: "220100",
        name: "长春市",
        counties: [
          { code: "220102", name: "南关区" },
          { code: "220104", name: "朝阳区" },
          { code: "220122", name: "农安县" },
        ],
      },
      {
        code: "220200",
        name: "吉林市",
        counties: [
          { code: "220202", name: "昌邑区" },
          { code: "220203", name: "龙潭区" },
          { code: "220221", name: "永吉县" },
        ],
      },
    ],
  },
  {
    code: "230000",
    name: "黑龙江省",
    cities: [
      {
        code: "230100",
        name: "哈尔滨市",
        counties: [
          { code: "230102", name: "道里区" },
          { code: "230103", name: "南岗区" },
          { code: "230123", name: "依兰县" },
        ],
      },
      {
        code: "230200",
        name: "齐齐哈尔市",
        counties: [
          { code: "230202", name: "龙沙区" },
          { code: "230203", name: "建华区" },
          { code: "230221", name: "龙江县" },
        ],
      },
    ],
  },
  {
    code: "310000",
    name: "上海市",
    cities: [
      {
        code: "310100",
        name: "上海市",
        counties: [
          { code: "310101", name: "黄浦区" },
          { code: "310104", name: "徐汇区" },
          { code: "310115", name: "浦东新区" },
          { code: "310118", name: "青浦区" },
        ],
      },
    ],
  },
  {
    code: "320000",
    name: "江苏省",
    cities: [
      {
        code: "320100",
        name: "南京市",
        counties: [
          { code: "320102", name: "玄武区" },
          { code: "320104", name: "秦淮区" },
          { code: "320115", name: "江宁区" },
        ],
      },
      {
        code: "320500",
        name: "苏州市",
        counties: [
          { code: "320505", name: "虎丘区" },
          { code: "320506", name: "吴中区" },
          { code: "320581", name: "常熟市" },
        ],
      },
    ],
  },
  {
    code: "330000",
    name: "浙江省",
    cities: [
      {
        code: "330100",
        name: "杭州市",
        counties: [
          { code: "330102", name: "上城区" },
          { code: "330106", name: "西湖区" },
          { code: "330110", name: "余杭区" },
        ],
      },
      {
        code: "330200",
        name: "宁波市",
        counties: [
          { code: "330203", name: "海曙区" },
          { code: "330205", name: "江北区" },
          { code: "330281", name: "余姚市" },
        ],
      },
    ],
  },
  {
    code: "340000",
    name: "安徽省",
    cities: [
      {
        code: "340100",
        name: "合肥市",
        counties: [
          { code: "340102", name: "瑶海区" },
          { code: "340104", name: "蜀山区" },
          { code: "340121", name: "长丰县" },
        ],
      },
      {
        code: "340200",
        name: "芜湖市",
        counties: [
          { code: "340202", name: "镜湖区" },
          { code: "340207", name: "鸠江区" },
          { code: "340221", name: "湾沚区" },
        ],
      },
    ],
  },
  {
    code: "350000",
    name: "福建省",
    cities: [
      {
        code: "350100",
        name: "福州市",
        counties: [
          { code: "350102", name: "鼓楼区" },
          { code: "350104", name: "仓山区" },
          { code: "350121", name: "闽侯县" },
        ],
      },
      {
        code: "350200",
        name: "厦门市",
        counties: [
          { code: "350203", name: "思明区" },
          { code: "350206", name: "湖里区" },
          { code: "350211", name: "集美区" },
        ],
      },
    ],
  },
  {
    code: "360000",
    name: "江西省",
    cities: [
      {
        code: "360100",
        name: "南昌市",
        counties: [
          { code: "360102", name: "东湖区" },
          { code: "360104", name: "青云谱区" },
          { code: "360121", name: "南昌县" },
        ],
      },
      {
        code: "360200",
        name: "景德镇市",
        counties: [
          { code: "360202", name: "昌江区" },
          { code: "360203", name: "珠山区" },
          { code: "360222", name: "浮梁县" },
        ],
      },
    ],
  },
  {
    code: "370000",
    name: "山东省",
    cities: [
      {
        code: "370100",
        name: "济南市",
        counties: [
          { code: "370102", name: "历下区" },
          { code: "370104", name: "槐荫区" },
          { code: "370114", name: "章丘区" },
        ],
      },
      {
        code: "370200",
        name: "青岛市",
        counties: [
          { code: "370202", name: "市南区" },
          { code: "370211", name: "黄岛区" },
          { code: "370281", name: "胶州市" },
        ],
      },
    ],
  },
  {
    code: "410000",
    name: "河南省",
    cities: [
      {
        code: "410100",
        name: "郑州市",
        counties: [
          { code: "410102", name: "中原区" },
          { code: "410105", name: "金水区" },
          { code: "410122", name: "中牟县" },
        ],
      },
      {
        code: "410300",
        name: "洛阳市",
        counties: [
          { code: "410302", name: "老城区" },
          { code: "410311", name: "洛龙区" },
          { code: "410322", name: "孟津区" },
        ],
      },
    ],
  },
  {
    code: "420000",
    name: "湖北省",
    cities: [
      {
        code: "420100",
        name: "武汉市",
        counties: [
          { code: "420102", name: "江岸区" },
          { code: "420106", name: "武昌区" },
          { code: "420111", name: "洪山区" },
        ],
      },
      {
        code: "420500",
        name: "宜昌市",
        counties: [
          { code: "420502", name: "西陵区" },
          { code: "420503", name: "伍家岗区" },
          { code: "420525", name: "远安县" },
        ],
      },
    ],
  },
  {
    code: "430000",
    name: "湖南省",
    cities: [
      {
        code: "430100",
        name: "长沙市",
        counties: [
          { code: "430102", name: "芙蓉区" },
          { code: "430104", name: "岳麓区" },
          { code: "430121", name: "长沙县" },
        ],
      },
      {
        code: "430200",
        name: "株洲市",
        counties: [
          { code: "430202", name: "荷塘区" },
          { code: "430204", name: "石峰区" },
          { code: "430221", name: "渌口区" },
        ],
      },
    ],
  },
  {
    code: "440000",
    name: "广东省",
    cities: [
      {
        code: "440100",
        name: "广州市",
        counties: [
          { code: "440103", name: "荔湾区" },
          { code: "440106", name: "天河区" },
          { code: "440113", name: "番禺区" },
        ],
      },
      {
        code: "440300",
        name: "深圳市",
        counties: [
          { code: "440303", name: "罗湖区" },
          { code: "440305", name: "南山区" },
          { code: "440307", name: "龙岗区" },
        ],
      },
    ],
  },
  {
    code: "450000",
    name: "广西壮族自治区",
    cities: [
      {
        code: "450100",
        name: "南宁市",
        counties: [
          { code: "450102", name: "兴宁区" },
          { code: "450103", name: "青秀区" },
          { code: "450110", name: "武鸣区" },
        ],
      },
      {
        code: "450300",
        name: "桂林市",
        counties: [
          { code: "450302", name: "秀峰区" },
          { code: "450305", name: "七星区" },
          { code: "450321", name: "阳朔县" },
        ],
      },
    ],
  },
  {
    code: "460000",
    name: "海南省",
    cities: [
      {
        code: "460100",
        name: "海口市",
        counties: [
          { code: "460105", name: "秀英区" },
          { code: "460106", name: "龙华区" },
          { code: "460108", name: "美兰区" },
        ],
      },
      {
        code: "460200",
        name: "三亚市",
        counties: [
          { code: "460202", name: "海棠区" },
          { code: "460203", name: "吉阳区" },
          { code: "460204", name: "天涯区" },
        ],
      },
    ],
  },
  {
    code: "500000",
    name: "重庆市",
    cities: [
      {
        code: "500100",
        name: "重庆市",
        counties: [
          { code: "500101", name: "万州区" },
          { code: "500103", name: "渝中区" },
          { code: "500106", name: "沙坪坝区" },
          { code: "500112", name: "渝北区" },
        ],
      },
    ],
  },
  {
    code: "510000",
    name: "四川省",
    cities: [
      {
        code: "510100",
        name: "成都市",
        counties: [
          { code: "510104", name: "锦江区" },
          { code: "510107", name: "武侯区" },
          { code: "510116", name: "双流区" },
        ],
      },
      {
        code: "510700",
        name: "绵阳市",
        counties: [
          { code: "510703", name: "涪城区" },
          { code: "510704", name: "游仙区" },
          { code: "510722", name: "三台县" },
        ],
      },
    ],
  },
  {
    code: "520000",
    name: "贵州省",
    cities: [
      {
        code: "520100",
        name: "贵阳市",
        counties: [
          { code: "520102", name: "南明区" },
          { code: "520103", name: "云岩区" },
          { code: "520121", name: "开阳县" },
        ],
      },
      {
        code: "520300",
        name: "遵义市",
        counties: [
          { code: "520302", name: "红花岗区" },
          { code: "520303", name: "汇川区" },
          { code: "520325", name: "道真仡佬族苗族自治县" },
        ],
      },
    ],
  },
  {
    code: "530000",
    name: "云南省",
    cities: [
      {
        code: "530100",
        name: "昆明市",
        counties: [
          { code: "530102", name: "五华区" },
          { code: "530103", name: "盘龙区" },
          { code: "530114", name: "呈贡区" },
        ],
      },
      {
        code: "530700",
        name: "丽江市",
        counties: [
          { code: "530702", name: "古城区" },
          { code: "530721", name: "玉龙纳西族自治县" },
          { code: "530724", name: "宁蒗彝族自治县" },
        ],
      },
    ],
  },
  {
    code: "540000",
    name: "西藏自治区",
    cities: [
      {
        code: "540100",
        name: "拉萨市",
        counties: [
          { code: "540102", name: "城关区" },
          { code: "540103", name: "堆龙德庆区" },
          { code: "540121", name: "林周县" },
        ],
      },
      {
        code: "540200",
        name: "日喀则市",
        counties: [
          { code: "540202", name: "桑珠孜区" },
          { code: "540221", name: "南木林县" },
          { code: "540223", name: "定日县" },
        ],
      },
    ],
  },
  {
    code: "610000",
    name: "陕西省",
    cities: [
      {
        code: "610100",
        name: "西安市",
        counties: [
          { code: "610102", name: "新城区" },
          { code: "610113", name: "雁塔区" },
          { code: "610116", name: "长安区" },
        ],
      },
      {
        code: "610400",
        name: "咸阳市",
        counties: [
          { code: "610402", name: "秦都区" },
          { code: "610404", name: "渭城区" },
          { code: "610422", name: "三原县" },
        ],
      },
    ],
  },
  {
    code: "620000",
    name: "甘肃省",
    cities: [
      {
        code: "620100",
        name: "兰州市",
        counties: [
          { code: "620102", name: "城关区" },
          { code: "620103", name: "七里河区" },
          { code: "620121", name: "永登县" },
        ],
      },
      {
        code: "620200",
        name: "嘉峪关市",
        counties: [{ code: "620201", name: "嘉峪关市" }],
      },
    ],
  },
  {
    code: "630000",
    name: "青海省",
    cities: [
      {
        code: "630100",
        name: "西宁市",
        counties: [
          { code: "630102", name: "城东区" },
          { code: "630103", name: "城中区" },
          { code: "630121", name: "大通回族土族自治县" },
        ],
      },
      {
        code: "632800",
        name: "海西蒙古族藏族自治州",
        counties: [
          { code: "632801", name: "格尔木市" },
          { code: "632802", name: "德令哈市" },
          { code: "632821", name: "乌兰县" },
        ],
      },
    ],
  },
  {
    code: "640000",
    name: "宁夏回族自治区",
    cities: [
      {
        code: "640100",
        name: "银川市",
        counties: [
          { code: "640104", name: "兴庆区" },
          { code: "640105", name: "西夏区" },
          { code: "640121", name: "永宁县" },
        ],
      },
      {
        code: "640200",
        name: "石嘴山市",
        counties: [
          { code: "640202", name: "大武口区" },
          { code: "640205", name: "惠农区" },
          { code: "640221", name: "平罗县" },
        ],
      },
    ],
  },
  {
    code: "650000",
    name: "新疆维吾尔自治区",
    cities: [
      {
        code: "650100",
        name: "乌鲁木齐市",
        counties: [
          { code: "650102", name: "天山区" },
          { code: "650104", name: "新市区" },
          { code: "650121", name: "乌鲁木齐县" },
        ],
      },
      {
        code: "650200",
        name: "克拉玛依市",
        counties: [
          { code: "650202", name: "独山子区" },
          { code: "650203", name: "克拉玛依区" },
          { code: "650204", name: "白碱滩区" },
        ],
      },
    ],
  },
  {
    code: "710000",
    name: "台湾省",
    cities: [
      {
        code: "710100",
        name: "台北市",
        counties: [
          { code: "710101", name: "中正区" },
          { code: "710102", name: "大同区" },
          { code: "710103", name: "中山区" },
        ],
      },
      {
        code: "710200",
        name: "高雄市",
        counties: [
          { code: "710201", name: "新兴区" },
          { code: "710202", name: "前金区" },
          { code: "710203", name: "苓雅区" },
        ],
      },
    ],
  },
  {
    code: "810000",
    name: "香港特别行政区",
    cities: [
      {
        code: "810100",
        name: "香港特别行政区",
        counties: [
          { code: "810101", name: "中西区" },
          { code: "810102", name: "湾仔区" },
          { code: "810103", name: "东区" },
          { code: "810104", name: "南区" },
        ],
      },
    ],
  },
  {
    code: "820000",
    name: "澳门特别行政区",
    cities: [
      {
        code: "820100",
        name: "澳门特别行政区",
        counties: [
          { code: "820101", name: "花地玛堂区" },
          { code: "820102", name: "花王堂区" },
          { code: "820103", name: "望德堂区" },
          { code: "820104", name: "大堂区" },
        ],
      },
    ],
  },
] as const;

function firstOrThrow<Item>(items: readonly Item[], message: string): Item {
  const item = items[0];
  if (!item) {
    throw new Error(message);
  }

  return item;
}

export function findRegionSelection(
  provinceCode: string,
  cityCode: string,
  countyCode: string,
): RegionSelection {
  const fallbackProvince = firstOrThrow(chinaRegions, "At least one China region must be defined");
  const province = chinaRegions.find((item) => item.code === provinceCode) ?? fallbackProvince;
  const fallbackCity = firstOrThrow(province.cities, "At least one city must be defined");
  const city = province.cities.find((item) => item.code === cityCode) ?? fallbackCity;
  const fallbackCounty = firstOrThrow(city.counties, "At least one county must be defined");
  const county = city.counties.find((item) => item.code === countyCode) ?? fallbackCounty;

  return { province, city, county };
}
