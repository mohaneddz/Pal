//! A minimal, safe arithmetic expression evaluator for the `calculate`
//! action. Deliberately not `eval`/shell -- this only understands numbers
//! and `+ - * / ^ ( )`, so there is no way to smuggle code through it.

#[derive(Debug, Clone, Copy, PartialEq)]
enum Token {
    Number(f64),
    Plus,
    Minus,
    Star,
    Slash,
    Caret,
    LParen,
    RParen,
}

fn tokenize(expression: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = expression.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        match ch {
            ' ' | '\t' | '\n' => i += 1,
            '+' => {
                tokens.push(Token::Plus);
                i += 1;
            }
            '-' => {
                tokens.push(Token::Minus);
                i += 1;
            }
            '*' => {
                tokens.push(Token::Star);
                i += 1;
            }
            '/' => {
                tokens.push(Token::Slash);
                i += 1;
            }
            '^' => {
                tokens.push(Token::Caret);
                i += 1;
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            c if c.is_ascii_digit() || c == '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1;
                }
                let text: String = chars[start..i].iter().collect();
                let number = text
                    .parse::<f64>()
                    .map_err(|_| format!("Invalid number: {text}"))?;
                tokens.push(Token::Number(number));
            }
            other => return Err(format!("Unexpected character in expression: '{other}'")),
        }
    }

    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<Token> {
        self.tokens.get(self.pos).copied()
    }

    fn advance(&mut self) -> Option<Token> {
        let token = self.peek();
        self.pos += 1;
        token
    }

    // expression := term (('+' | '-') term)*
    fn parse_expression(&mut self) -> Result<f64, String> {
        let mut value = self.parse_term()?;
        loop {
            match self.peek() {
                Some(Token::Plus) => {
                    self.advance();
                    value += self.parse_term()?;
                }
                Some(Token::Minus) => {
                    self.advance();
                    value -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Ok(value)
    }

    // term := unary (('*' | '/') unary)*
    fn parse_term(&mut self) -> Result<f64, String> {
        let mut value = self.parse_unary()?;
        loop {
            match self.peek() {
                Some(Token::Star) => {
                    self.advance();
                    value *= self.parse_unary()?;
                }
                Some(Token::Slash) => {
                    self.advance();
                    let divisor = self.parse_unary()?;
                    if divisor == 0.0 {
                        return Err("Division by zero.".to_string());
                    }
                    value /= divisor;
                }
                _ => break,
            }
        }
        Ok(value)
    }

    // unary := '-' unary | power
    fn parse_unary(&mut self) -> Result<f64, String> {
        if let Some(Token::Minus) = self.peek() {
            self.advance();
            return Ok(-self.parse_unary()?);
        }
        self.parse_power()
    }

    // power := primary ('^' unary)?  (right-associative)
    fn parse_power(&mut self) -> Result<f64, String> {
        let base = self.parse_primary()?;
        if let Some(Token::Caret) = self.peek() {
            self.advance();
            let exponent = self.parse_unary()?;
            return Ok(base.powf(exponent));
        }
        Ok(base)
    }

    // primary := NUMBER | '(' expression ')'
    fn parse_primary(&mut self) -> Result<f64, String> {
        match self.advance() {
            Some(Token::Number(value)) => Ok(value),
            Some(Token::LParen) => {
                let value = self.parse_expression()?;
                match self.advance() {
                    Some(Token::RParen) => Ok(value),
                    _ => Err("Expected closing ')'.".to_string()),
                }
            }
            other => Err(format!("Unexpected token: {other:?}")),
        }
    }
}

pub fn evaluate(expression: &str) -> Result<f64, String> {
    let tokens = tokenize(expression)?;
    if tokens.is_empty() {
        return Err("Empty expression.".to_string());
    }
    let mut parser = Parser { tokens, pos: 0 };
    let value = parser.parse_expression()?;
    if parser.pos != parser.tokens.len() {
        return Err("Unexpected trailing input in expression.".to_string());
    }
    if !value.is_finite() {
        return Err("Result is not a finite number.".to_string());
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluates_basic_arithmetic() {
        assert_eq!(evaluate("2 + 3").unwrap(), 5.0);
        assert_eq!(evaluate("47 * 12.5").unwrap(), 587.5);
        assert_eq!(evaluate("(3 + 4) / 2").unwrap(), 3.5);
        assert_eq!(evaluate("2 ^ 10").unwrap(), 1024.0);
        assert_eq!(evaluate("-5 + 2").unwrap(), -3.0);
    }

    #[test]
    fn rejects_division_by_zero() {
        assert!(evaluate("1 / 0").is_err());
    }

    #[test]
    fn rejects_garbage_input() {
        assert!(evaluate("2 + ").is_err());
        assert!(evaluate("rm -rf /").is_err());
    }
}
