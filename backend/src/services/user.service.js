const UserModel = require('../models/user.model');
const WalletModel = require('../models/wallet.model');
const EmailVerifyModel = require('../models/emailVerify.model');
const ManageUserModel = require('../models/manageUser.model');
const HttpException = require('../utils/HttpException.utils');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const Role = require('../utils/userRoles.utils');
const EmailType = require('../utils/emailType.utils');
const Wallet = require('../utils/wallet.utils');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { raw } = require('sqlstring');
const emailService = require('./emailer.service')
const xoauth2 = require('xoauth2')
const i18n = require('i18n');
const XOAuth2 = require('nodemailer/lib/xoauth2');

dotenv.config();

class UserService {
    static sendEmail(email, uniqueString, emailType) {
        // var transport = nodemailer.createTransport({
        //     //service: process.env.EMAIL_SERVICE,
        //     host: process.env.EMAIL_HOST,
        //     port: Number(process.env.EMAIL_PORT),
        //     auth: {
        //         user: process.env.EMAIL_USER,
        //         pass: process.env.EMAIL_PWD
        //     }
        // });
        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                type: 'OAuth2',
                user: 'ibealex55@gmail.com',
                clientId: '590324629645-gdnrgieh1nilofutlcn1qrgrjve7hou6.apps.googleusercontent.com',
                clientSecret: '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',
                refreshToken: '1/XXxXxsss-xxxXXXXXxXxx0XXXxxXXx0x00xxx',
                accessToken: 'ya29.Xx_XX0xxxxx-xX0X0XxXXxXxXXXxX0x'
            }
        });
        var mailOptions = {}
        if (emailType === EmailType.EmailVerify) {
            mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Email Verification',
                text: 'Your Email verification code is : ' + uniqueString + '. Send this with your information.'
            };
        } else if (emailType === EmailType.ResetPassword) {
            mailOptions = {
                from: process.env.EMAIL,
                to: email,
                subject: 'Reset Password',
                text: 'Did you forget your password? To reset your password please visit here : ' + uniqueString
            };
        }

        transport.sendMail(mailOptions, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
    }

    

    static makeRandomString(length) {
        let result = "";
        let characters = "0123456789";
        for (let i = 0; i < length; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result
    }

    // static async verifyEmail(email, locale) {
    //     if (!this.emailValidation(email)) {
    //         return {response: false, message: "Email validation failed.", data:null}
    //     }
    //     let verificationCode = this.makeRandomString(4);

    //     const subject = i18n.__({phrase: "MGL Exchange: Email Verification", locale: locale})
    //     const body = i18n.__({phrase: "Your Email verification code is %s", locale: locale}, verificationCode);
    //     emailService.deliverEmail(email, subject, body)
        
    //     let prev = await EmailVerifyModel.findOne({email:email});
    //     if (prev) {
    //         let result = await EmailVerifyModel.update({verify_code:verificationCode}, prev.id);
    //         if (!result) {
    //             return {response: false, message: "An error was caused during the Email Verification Code generation.", data:null}
    //         }
    //         if (result.error) {
    //             return {response: false, message: result.error, data:null}
    //         }
    //     } else {
    //         let result = await EmailVerifyModel.create({email:email, verify_code:verificationCode})
    //         if (!result) {
    //             return {response: false, message: "An error was caused during the Email Verification Code generation.", data:null}
    //         }
    //         if (result.error) {
    //             return {response: false, message: result.error, data:null}
    //         }
    //     }
    //     console.log(verificationCode)
    //     return {response: true, message: "Success. Email Verification Code was send to your Email address.", data:null}
    // }

    static async getAllUsers() {
        let userList = await UserModel.find();
        if (userList.length === 0) {
            return {response:false, message:"Users not found", data:null}
        }

        userList = userList.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });

        return {response: true, message:"Success", data:userList}
    }

    static async getUsers(sortBy, pageNumber, itemsPerPage) {
        if (sortBy !== "id" && sortBy !== "email" && sortBy !== "have_wallet" && sortBy !== "wallet_address") {
            return {response:false, message:"Sorting Error.", data:null};
        }
        let direction = sortBy === "id" ? "ASC" : "DESC" 
        let userList = await ManageUserModel.find(sortBy, direction);
        userList = userList.map(user => {
            user.have_wallet === 1 ? user.have_wallet = true : user.have_wallet = false
            return user;
        });
        let userData = userList.slice((pageNumber - 1) * itemsPerPage, pageNumber * itemsPerPage)
        return {response:true, message:"Success", data:{totalNumber:userList.length, users:userData}}
    }

    static async getUserById(userId) {
        const user = await UserModel.findOne({ id: userId });
        if (!user) {
            return {response: false, message:'User not found', data:null}
        }

        const { password, ...userWithoutPassword } = user;

        return {response: true, message:"Success", data:userWithoutPassword};
    };

    static getCurrentUser(currentUser) {
        console.log(currentUser)
        const { password, ...userWithoutPassword } = currentUser;

        return {response:true, message:"Success", data:userWithoutPassword};
    };

    static async createUser(rawData) {
        const check = this.checkValidation(rawData);
        if (!check) {
            return {response:false, message:"Send data validation error", data:null}
        }
        const user = await UserModel.findOne({email:rawData.email});
        if (user) {
            return {response:false, message:"Already registered user.", data:null}
        }
        rawData.password = await this.hashPassword(rawData.password);
        const result = await UserModel.create(rawData);

        if (!result) {
            return {response:false, message:"An error caused during creating new user", data:null}
        }
        if (result.error) {
            return {response:false, message:result.error, data:null}
        }
        await ManageUserModel.create({email:rawData.email, have_wallet:false, wallet_address:""});
        return {response:true, message:"Success", data:null}
    };

    static async updateUser(rawData, userId) {
        const check = this.checkValidation(rawData);
        if (!check) {
            return {response:false, message:"Send data validation error", data:null}
        }

        rawData.password = await this.hashPassword(rawData.password);

        const { confirm_password, ...restOfUpdates } = rawData;

        const result = await UserModel.update(restOfUpdates, userId);

        if (!result) {
            return {response:false, message:"An error caused during updating an exiting user.", data:null}
        }
        if (result.error) {
            return {response:false, message:result.error, data:null}
        }

        return { response:true, message:"Successfully updated", data:null };
    };

    static async updatePassword(rawData, userId) {
        const user = await UserModel.findOne({id:userId});
        if (!user) {
            return {response:false, message:"Unregistered User.", data:null};
        }
        if (user.email !== rawData.email) {
            return {response:false, message:"Email address is wrong.", data:null};
        }
        if (rawData.currentPassword) {
            let isMatch = await bcrypt.compare(rawData.currentPassword, user.password);
            if (!isMatch) {
                return {response:false, message:'Current password is incorrect', data:null};
            }
            rawData.password = await this.hashPassword(rawData.password);
            const result = await UserModel.update({password:rawData.password}, userId);
        
            if (!result) {
                return {response:false, message:"An error caused during updating your password.", data:null}
            }
            if (result.error) {
                return {response:false, message:result.error, data:null}
            }
        } else {
            rawData.password = await this.hashPassword(rawData.password);
            const result = await UserModel.update({password:rawData.password}, userId);
        
            if (!result) {
                return {response:false, message:"An error caused during updating your password.", data:null}
            }
            if (result.error) {
                return {response:false, message:result.error, data:null}
            }
        }

        return { response:true, message:"Successfully updated", data:null };
    }

    static async deleteUser(userId) {
        if (userId === 1) {
            return {response:false, message:"Cannot delete admin user.", data:null}
        }
        const result = await UserModel.delete({id: userId});
        if (!result) {
            return {response:false, message:"The user does not exist.", data:null}
        }
        if (result.error) {
            return {response:false, message:result.error, data:null}
        }
        await ManageUserModel.delete({id: userId});
        await WalletModel.delete({user_id: userId});

        return {response:true, message:"Successfully deleted.", data:null}
    };

    static async signUp(rawData) {
        const check = this.checkValidation(rawData);
    
        if (!check) {
            return {response:false, message:"Send data validation error", data:null}
        }
        rawData.password = await this.hashPassword(rawData.password);
        let checker = await UserModel.findOne({email:rawData.email});
        console.log("Checker:", checker);
        if (checker) {
            return {response:false, message:"This Email already in use", data:null}
        }
        //check email verification
        let verifier = await EmailVerifyModel.findOne({email:rawData.email});
        if (!verifier) {
            // return {response:false, message:"Please receive and resend the Email verification code.", data:null}
            const verificationCode = this.makeRandomString(4);
            // const verificationCode = Math.floor(1000 + Math.random() * 9000);
            console.log("Verification Code:", verificationCode);

     // Save the email and verification code to the EmailVerifyModel
          const resultEmailVerify = await EmailVerifyModel.create({ email: rawData.email, verify_code: verificationCode });
          console.log("After email verification code insertion");

        //   const subject = i18n.__({phrase: "MGL Exchange: Email Verification", locale: locale})
        //   const body = i18n.__({phrase: "Your Email verification code is %s", locale: locale}, verificationCode);
        //   emailService.deliverEmail(email, subject, body)
        try {
            const subject = i18n.__({ phrase: "MGL Exchange: Email Verification", locale: rawData.locale || "en" });
        const body = i18n.__({ phrase: "Your Email verification code is %s", locale: rawData.locale || "en" }, verificationCode);

// Assuming rawData.locale is the user's preferred locale. If not available, default to "en".
         emailService.deliverEmail(rawData.email, subject, body);
        } catch (error) {
            console.log('error sending mail', error)
        }
        

        console.log('results email verify', resultEmailVerify)
         if (resultEmailVerify.error || resultEmailVerify.affectedRows !== 1) {
//         Handle the error, e.g., log it and return an appropriate response
         return { response: false, message: "Error saving email verification code", data: null };
    }


         return {response:false, message:"Please receive and resend the Email verification code.", data:null}
           }
       
           if (!!resultEmailVerify.error || resultEmailVerify !== 1) {
            return {response:false, message:"Email verification code is wrong.", data:null}
        }
        //check invite code
        if (parseInt(rawData.invite_code) !== 0) {
            let inviter = await UserModel.findOne({id:parseInt(rawData.invite_code)});
            if (!inviter) {
                return {response:false, message:"Invite code wrong", data:null}
            }
        }
        
        // user register
        rawData.role = Role.General;
        rawData.get_bnb = false;
        const { confirm_password, email_verify, ...registerData } = rawData;

        const result = await UserModel.create(registerData);

        if (!result) {
            return {response:false, message:"An error was caused during user registeration.", data:null}
        }
        if (result.error) {
            return {response:false, message:result.error, data:null}
        }

        await ManageUserModel.create({email:registerData.email, have_wallet:false, wallet_address:""});
        const subject = i18n.__({phrase: "MGL Exchange: Account Created Sucessfully", locale: rawData.locale || "En"})
        const body = i18n.__({phrase: "Your MGL Exchange account has been created sucessfully. Thank you.", locale: rawData.locale || "En"});
        emailService.deliverEmail(rawData.email, subject, body);
        
        return {response:true, message:"Success", data:null}
    };

    // static async userLogin(rawData) {
    //     const check = this.checkValidation(rawData);
    //     if (!check) {
    //         return {response:false, message:"Send data validation error", data:null}
    //     }
    //     const { email, password: pass } = rawData;
    //     const user = await UserModel.findOne({ email });
    //     if (!user) {
    //         return {response: false, message:"Unregistered user!", data:null}
    //     }
    //     const isMatch = await bcrypt.compare(pass, user.password);
    //     if (!isMatch) {
    //         return {response:false, message:'Incorrect password!', data:null}
    //     }

    //     // user matched!
    //     const secretKey = process.env.SECRET_JWT || "";
    //     const token = jwt.sign({ user_id: user.id.toString() }, secretKey, {
    //         expiresIn: '24h'
    //     });

    //     const { password, ...userInfo } = user;

    //     let wallets = await WalletModel.find({user_id:user.id});
    //     if (wallets.length === 0) {
    //         return {response:true, message:"Success!", data: { userInfo, token, keyPair:null }}
    //     }
    //     let keyPair = [];
    //     for (let i = 0; i < wallets.length; i ++) {
    //         let privateKey = new Wallet().encrypt(wallets[i].privatekey)
    //         keyPair.push({publicKey: wallets[i].publickey, privateKey: privateKey});
    //     }
    //     return {response:true, message:"Success!", data: { userInfo, token, keyPair:keyPair }}
    // };

    static async userLogin(rawData) {
        try {
            const check = this.checkValidation(rawData);
            if (!check) {
                return { response: false, message: "Send data validation error", data: null };
            }
            const { email, password: pass } = rawData;
            const user = await UserModel.findOne({ email });
            if (!user) {
                return { response: false, message: "Unregistered user!", data: null };
            }
            const isMatch = await bcrypt.compare(pass, user.password);
            if (!isMatch) {
                return { response: false, message: 'Incorrect password!', data: null };
            }
    
            // user matched!
            const secretKey = process.env.SECRET_JWT || "";
            const token = jwt.sign({ user_id: user.id.toString() }, secretKey, {
                expiresIn: '24h'
            });
    
            const { password, ...userInfo } = user;
    
            let wallets = await WalletModel.find({ user_id: user.id });
            if (wallets.length === 0) {
                const response = { response: true, message: "Success!", data: { userInfo, token, keyPair: null } };
                console.log('Response:', response); // Log the response
                return response;
            }
    
            let keyPair = [];
            for (let i = 0; i < wallets.length; i++) {
                let privateKey = new Wallet().encrypt(wallets[i].privatekey);
                keyPair.push({ publicKey: wallets[i].publickey, privateKey: privateKey });
            }
    
            const response = { response: true, message: "Success!", data: { userInfo, token, keyPair: keyPair } };
            console.log('Response:', response); // Log the response
            return response;
        } catch (error) {
            console.error('Error in userLogin:', error);
            return { response: false, message: 'An error occurred during login.', data: null };
        }
    }
    

    static async forgotPassword(rawData) {
        if (!this.emailValidation(rawData.email)) {
            return {response:false, message:"Email validation failed.", data:null};
        }
        const user = await UserModel.findOne({email:rawData.email});
        if (!user) {
            return {response:false, message:"Unregistered user.", data:false};
        }
        const secretKey = process.env.SECRET_JWT || "";
        const token = jwt.sign({user_id:user.id.toString()}, secretKey, {
            expiresIn: '2h'
        });
        const link = `${process.env.FRONT_URL}resetpassword/${token}`;
        console.log(link)

        const subject = i18n.__({phrase: "MGL Exchange - Password Reset", locale: rawData.locale || "En"})
        const body = i18n.__({phrase: "To reset your password, please click on this link: %s", locale: rawData.locale || "En"}, link);
        emailService.deliverEmail(user.email, subject, body);

        return {response:true, message:"Success. Please check your Email inbox.", data:null};
    }

    static checkValidation(data) {
        const errors = validationResult(data)
        if (!errors.isEmpty()) {
            return false
        }
        return true
    }

    // hash password if it exists
    static async hashPassword(password) {
        if (password) {
            password = await bcrypt.hash(password, 8);
            return password
        }
    }

    
    static emailValidation(enteredEmail){
        var mail_format = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

        if(enteredEmail.match(mail_format))
        {
            return true;
        } else {
            return false;
        }
    }
}

module.exports = UserService