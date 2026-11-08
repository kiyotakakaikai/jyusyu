// 学名 → 和名（内蔵辞書）。現場で追加した分は「設定 → 辞書」に保存され、こちらより優先されます。
// 表記ゆれ（×の有無、大文字小文字、変種名の有無）は自動で吸収します。
const BUILTIN_DICT = {
  // サクラ・バラ科
  "Prunus × yedoensis": "ソメイヨシノ", "Cerasus × yedoensis": "ソメイヨシノ",
  "Prunus jamasakura": "ヤマザクラ", "Cerasus jamasakura": "ヤマザクラ",
  "Prunus speciosa": "オオシマザクラ", "Cerasus speciosa": "オオシマザクラ",
  "Prunus mume": "ウメ", "Prunus persica": "モモ", "Prunus salicina": "スモモ", "Prunus armeniaca": "アンズ",
  "Malus domestica": "リンゴ", "Pyrus pyrifolia": "ナシ", "Eriobotrya japonica": "ビワ",
  "Chaenomeles speciosa": "ボケ", "Photinia glabra": "カナメモチ", "Rhaphiolepis umbellata": "シャリンバイ",
  // イチョウ・針葉樹
  "Ginkgo biloba": "イチョウ",
  "Pinus densiflora": "アカマツ", "Pinus thunbergii": "クロマツ", "Pinus parviflora": "ゴヨウマツ", "Pinus pumila": "ハイマツ",
  "Cryptomeria japonica": "スギ", "Chamaecyparis obtusa": "ヒノキ", "Chamaecyparis pisifera": "サワラ",
  "Metasequoia glyptostroboides": "メタセコイア", "Taxodium distichum": "ラクウショウ", "Cedrus deodara": "ヒマラヤスギ",
  "Taxus cuspidata": "イチイ", "Podocarpus macrophyllus": "イヌマキ", "Torreya nucifera": "カヤ",
  "Abies firma": "モミ", "Larix kaempferi": "カラマツ",
  // ブナ科
  "Quercus serrata": "コナラ", "Quercus acutissima": "クヌギ", "Quercus variabilis": "アベマキ",
  "Quercus crispula": "ミズナラ", "Quercus dentata": "カシワ", "Quercus myrsinifolia": "シラカシ",
  "Quercus glauca": "アラカシ", "Quercus phillyreoides": "ウバメガシ", "Quercus acuta": "アカガシ",
  "Quercus salicina": "ウラジロガシ", "Quercus sessilifolia": "ツクバネガシ",
  "Castanopsis sieboldii": "スダジイ", "Castanopsis cuspidata": "ツブラジイ", "Lithocarpus edulis": "マテバシイ",
  "Castanea crenata": "クリ", "Fagus crenata": "ブナ",
  // カバノキ科
  "Carpinus laxiflora": "アカシデ", "Carpinus tschonoskii": "イヌシデ", "Betula platyphylla": "シラカンバ", "Alnus japonica": "ハンノキ",
  // ニレ・アサ科
  "Zelkova serrata": "ケヤキ", "Celtis sinensis": "エノキ", "Aphananthe aspera": "ムクノキ", "Ulmus parvifolia": "アキニレ",
  // クスノキ科
  "Cinnamomum camphora": "クスノキ", "Camphora officinarum": "クスノキ", "Cinnamomum yabunikkei": "ヤブニッケイ",
  "Machilus thunbergii": "タブノキ", "Neolitsea sericea": "シロダモ", "Lindera umbellata": "クロモジ", "Laurus nobilis": "ゲッケイジュ",
  // カエデ・ムクロジ科
  "Acer palmatum": "イロハモミジ", "Acer buergerianum": "トウカエデ", "Acer rubrum": "アメリカハナノキ", "Acer negundo": "ネグンドカエデ",
  "Aesculus turbinata": "トチノキ", "Aesculus hippocastanum": "セイヨウトチノキ", "Koelreuteria paniculata": "モクゲンジ",
  // 街路樹・公園樹
  "Platanus × hispanica": "モミジバスズカケノキ", "Platanus orientalis": "スズカケノキ",
  "Liquidambar styraciflua": "モミジバフウ", "Liquidambar formosana": "フウ", "Liriodendron tulipifera": "ユリノキ",
  "Cercidiphyllum japonicum": "カツラ", "Styphnolobium japonicum": "エンジュ", "Robinia pseudoacacia": "ニセアカシア",
  "Albizia julibrissin": "ネムノキ", "Cercis chinensis": "ハナズオウ", "Wisteria floribunda": "フジ",
  "Paulownia tomentosa": "キリ", "Catalpa ovata": "キササゲ", "Idesia polycarpa": "イイギリ",
  // モクレン科
  "Magnolia kobus": "コブシ", "Magnolia grandiflora": "タイサンボク", "Magnolia obovata": "ホオノキ",
  "Magnolia denudata": "ハクモクレン", "Magnolia liliiflora": "シモクレン", "Magnolia stellata": "シデコブシ",
  // ミズキ科
  "Cornus florida": "ハナミズキ", "Cornus controversa": "ミズキ", "Cornus kousa": "ヤマボウシ",
  // ツバキ・モッコク科
  "Camellia japonica": "ヤブツバキ", "Camellia sasanqua": "サザンカ", "Camellia sinensis": "チャノキ",
  "Cleyera japonica": "サカキ", "Eurya japonica": "ヒサカキ", "Ternstroemia gymnanthera": "モッコク",
  "Stewartia pseudocamellia": "ナツツバキ", "Stewartia monadelpha": "ヒメシャラ",
  // モクセイ科
  "Ligustrum lucidum": "トウネズミモチ", "Ligustrum japonicum": "ネズミモチ", "Osmanthus fragrans": "モクセイ（キンモクセイ等）",
  "Osmanthus heterophyllus": "ヒイラギ", "Syringa vulgaris": "ライラック", "Forsythia suspensa": "レンギョウ",
  // 常緑の生垣・庭木
  "Ilex integra": "モチノキ", "Ilex crenata": "イヌツゲ", "Ilex rotunda": "クロガネモチ",
  "Euonymus japonicus": "マサキ", "Buxus microphylla": "ツゲ", "Pittosporum tobira": "トベラ",
  "Daphniphyllum macropodum": "ユズリハ", "Aucuba japonica": "アオキ", "Fatsia japonica": "ヤツデ",
  "Viburnum odoratissimum": "サンゴジュ", "Viburnum dilatatum": "ガマズミ", "Gardenia jasminoides": "クチナシ",
  "Nandina domestica": "ナンテン", "Distylium racemosum": "イスノキ", "Loropetalum chinense": "トキワマンサク",
  "Rhododendron kaempferi": "ヤマツツジ", "Rhododendron indicum": "サツキ", "Hydrangea macrophylla": "アジサイ",
  "Deutzia crenata": "ウツギ", "Hibiscus syriacus": "ムクゲ", "Hibiscus mutabilis": "フヨウ",
  // その他の落葉樹
  "Diospyros kaki": "カキ", "Salix babylonica": "シダレヤナギ", "Lagerstroemia indica": "サルスベリ",
  "Styrax japonicus": "エゴノキ", "Clethra barbinervis": "リョウブ", "Hamamelis japonica": "マンサク",
  "Kalopanax septemlobus": "ハリギリ", "Trochodendron aralioides": "ヤマグルマ",
  "Morus alba": "マグワ", "Broussonetia papyrifera": "カジノキ", "Maclura tricuspidata": "ハリグワ",
  "Ficus carica": "イチジク", "Ficus microcarpa": "ガジュマル",
  "Zanthoxylum piperitum": "サンショウ", "Phellodendron amurense": "キハダ", "Ailanthus altissima": "ニワウルシ",
  "Melia azedarach": "センダン", "Toona sinensis": "チャンチン",
  "Toxicodendron succedaneum": "ハゼノキ", "Toxicodendron vernicifluum": "ウルシ", "Cotinus coggygria": "スモークツリー",
  "Citrus unshiu": "ウンシュウミカン", "Citrus junos": "ユズ",
  // ヤシ・ソテツ・タケ
  "Trachycarpus fortunei": "シュロ", "Phoenix canariensis": "カナリーヤシ", "Cycas revoluta": "ソテツ",
  "Phyllostachys edulis": "モウソウチク", "Phyllostachys bambusoides": "マダケ"
};

// 種まで辞書に無いときの「属」表示
const GENUS_DICT = {
  "Prunus": "サクラ属", "Cerasus": "サクラ属", "Malus": "リンゴ属", "Pyrus": "ナシ属",
  "Quercus": "コナラ属", "Castanopsis": "シイ属", "Fagus": "ブナ属", "Castanea": "クリ属",
  "Acer": "カエデ属", "Aesculus": "トチノキ属", "Pinus": "マツ属", "Abies": "モミ属", "Picea": "トウヒ属",
  "Chamaecyparis": "ヒノキ属", "Juniperus": "ビャクシン属", "Magnolia": "モクレン属", "Camellia": "ツバキ属",
  "Ilex": "モチノキ属", "Salix": "ヤナギ属", "Populus": "ヤマナラシ属", "Ulmus": "ニレ属", "Fraxinus": "トネリコ属",
  "Betula": "カバノキ属", "Carpinus": "クマシデ属", "Cinnamomum": "クスノキ属", "Ficus": "イチジク属",
  "Citrus": "ミカン属", "Rhododendron": "ツツジ属", "Viburnum": "ガマズミ属", "Cornus": "ミズキ属",
  "Tilia": "シナノキ属", "Rosa": "バラ属", "Hydrangea": "アジサイ属", "Ligustrum": "イボタノキ属", "Euonymus": "ニシキギ属",
  "Platanus": "スズカケノキ属", "Liquidambar": "フウ属", "Phyllostachys": "マダケ属"
};
