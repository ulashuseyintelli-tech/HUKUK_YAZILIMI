const objectKeysNullCheck = (object, checkEmptyString) => {
  if (object) {
    let status = true;
    Object.keys(object).map((key) => {
      if (checkEmptyString)
        if (!object[key] || object[key].length === 0) status = false;
        else if (!object[key]) status = false;
    });
    return status;
  } else return false;
};

const objectArrayNullCheck = (objectArray, checkEmptyString) => {
  if (objectArray && Array.isArray(objectArray)) {
    let status = true;
    objectArray.map((object) => {
      if (!objectKeysNullCheck(object, checkEmptyString)) status = false;
    });
    return status;
  } else return false;
};

const nameValidation = (name) => {
  let letter = new RegExp("^[a-zA-Z]+$");
  let maxLength = new RegExp("^(?=.{1,25}$)");
  if (!letter.test(name)) {
    return { status: false, message: "İsim sadece harf içerebilir" };
  } else if (!maxLength.test(name)) {
    return {
      status: false,
      message: "İsim uzunluğu 1 ile 25 karakter arasında olmalıdır.",
    };
  } else {
    return { status: true };
  }
};

const emailValidation = (email) => {
  let emailControl = /^(([^<>()[\]{}'^?\\.,!|//#%*-+=&;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;
  if (!emailControl.test(email)) {
    return {
      status: false,
      message: "Lütfen geçerli bir e-posta adresi giriniz!",
    };
  } else {
    return { status: true };
  }
};

const passwordValidation = (password) => {
  let lowerCase = new RegExp("^(?=.*[a-z])");
  let upperCase = new RegExp("^(?=.*[A-Z])");
  let number = new RegExp("^(?=.*[0-9])");
  let length = new RegExp("^(?=.{6,25}$)");
  if (!lowerCase.test(password)) {
    return { status: false, message: "Şifre en az 1 küçük harf içermelidir!" };
  } else if (!upperCase.test(password)) {
    return { status: false, message: "Şifre en az 1 büyük harf içermelidir!" };
  } else if (!number.test(password)) {
    return { status: false, message: "Şifre en az 1 rakam içermelidir!" };
  } else if (!length.test(password)) {
    return {
      status: false,
      message: "Şifre uzunluğu 6 karakter ile 25 karakter arasında olmalıdır!",
    };
  } else {
    return { status: true };
  }
};

const urlValidation = (url) => {
  let validation = new RegExp(
    /[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi
  );
  if (!validation.test(url)) {
    return { status: false, message: "Geçersiz URL girdiniz." };
  } else {
    return { status: true };
  }
};

const findNullAddress = (addresses) => {
  let status = false;
  if (Array.isArray(addresses)) {
    addresses.map((address) => {
      Object.keys(address).map((key) => {
        if (address[key] === "") {
          status = true;
        }
      });
    });
  }
  return status;
};

module.exports = {
  objectKeysNullCheck,
  objectArrayNullCheck,
  nameValidation,
  emailValidation,
  passwordValidation,
  urlValidation,
  findNullAddress,
};
