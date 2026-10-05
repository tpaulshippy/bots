// Stub for react-native-svg under Jest.
//
// The only importer in app code is react-native-progress (used by the study
// progress bar and the parent dashboard). Its source ships untranspiled, so
// Jest compiles ~110 SVG modules before any assertion runs. None of the tests
// assert on SVG output, so the stub keeps those suites fast without changing
// what they verify.
const React = require('react');
const { View } = require('react-native');

const make = (name) => {
  const Component = React.forwardRef((props, ref) =>
    React.createElement(View, { ref, ...props })
  );
  Component.displayName = name;
  return Component;
};

module.exports = {
  __esModule: true,
  Svg: make('Svg'),
  SvgXml: make('SvgXml'),
  SvgUri: make('SvgUri'),
  Circle: make('Circle'),
  Ellipse: make('Ellipse'),
  G: make('G'),
  Text: make('SvgText'),
  TSpan: make('TSpan'),
  TextPath: make('TextPath'),
  Path: make('Path'),
  Polygon: make('Polygon'),
  Polyline: make('Polyline'),
  Line: make('Line'),
  Rect: make('Rect'),
  Use: make('Use'),
  Image: make('SvgImage'),
  Symbol: make('Symbol'),
  Defs: make('Defs'),
  LinearGradient: make('LinearGradient'),
  RadialGradient: make('RadialGradient'),
  Stop: make('Stop'),
  ClipPath: make('ClipPath'),
  Pattern: make('Pattern'),
  Mask: make('Mask'),
  Marker: make('Marker'),
  ForeignObject: make('ForeignObject'),
};