export const STADIUM_LUA_COMPATIBILITY = `
  if math.frexp == nil then
    function math.frexp(value)
      if value == 0 then return 0, 0 end
      local magnitude = value < 0 and -value or value
      local exponent = 0
      while magnitude >= 1 do
        magnitude = magnitude / 2
        exponent = exponent + 1
      end
      while magnitude < 0.5 do
        magnitude = magnitude * 2
        exponent = exponent - 1
      end
      return value / (2 ^ exponent), exponent
    end
  end
`;
